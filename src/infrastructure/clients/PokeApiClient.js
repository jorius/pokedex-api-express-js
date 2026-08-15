/**
 * Gateway to the external PokeAPI (https://pokeapi.co/docs/v2).
 * SINGLETON: the composition root (src/Container.js) creates exactly
 * one instance per process — ESM module evaluation guarantees the container runs
 * once, so this is the singleton pattern chosen for external API consumption.
 *
 * Two-tier read-through cache on ASSEMBLED results:
 *   L1 (memory, short TTL) → L2 (shared Redis, long TTL) → network.
 * Key scheme is shared verbatim by all three backend services:
 *   pokeapi:list:{page}:{pageSize}   pokeapi:pokemon:{idOrName}
 *
 * PokeAPI natively accepts id-or-name in one path segment, so this internal
 * gateway keeps a single detail method; the REST surface stays split.
 */

const isPresent = (value) => value !== null;

const mapAbilities = (abilities) => abilities.map((ability) => ({
  name: ability.ability.name,
  slot: ability.slot,
  isHidden: ability.is_hidden,
}));

const pickSprite = (sprites) => sprites.other?.['official-artwork']?.front_default ?? sprites.front_default ?? null;

const pickEnglish = (entries) => entries.find((entry) => entry.language.name === 'en');

const flattenChain = (link) => [link.species.name, ...link.evolves_to.flatMap((evolution) => flattenChain(evolution))];

/**
 * Cache values must never crash the client: a malformed L1/L2 entry (corruption,
 * partial write, cross-version drift) degrades to a cache miss — same invariant
 * RedisCache upholds for transport failures — so callers simply fall through to
 * the next tier / network instead of throwing.
 */
const safeParse = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isFulfilled = (result) => result.status === 'fulfilled';

/**
 * Factory for the PokeAPI gateway client.
 *
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {import('../../application/ports/CachePort.js').CachePort} options.l1
 * @param {import('../../application/ports/CachePort.js').CachePort} options.l2
 * @param {number} options.l1TtlSeconds
 * @param {number} options.l2TtlSeconds
 * @param {typeof fetch} [options.fetchFn]
 * @returns {import('../../application/ports/PokeApiPort.js').PokeApiPort}
 */
const createPokeApiClient = ({
  baseUrl, l1, l2, l1TtlSeconds, l2TtlSeconds, fetchFn = fetch,
}) => {
  const readCache = async (key) => {
    const fromL1 = await l1.get(key);
    if (fromL1 !== null) {
      const parsed = safeParse(fromL1);
      if (parsed !== null) return parsed;
    }

    const fromL2 = await l2.get(key);
    if (fromL2 !== null) {
      const parsed = safeParse(fromL2);
      if (parsed !== null) {
        await l1.set(key, fromL2, l1TtlSeconds);
        return parsed;
      }
    }

    return null;
  };

  const writeCache = async (key, value) => {
    const serialized = JSON.stringify(value);
    await Promise.all([
      l1.set(key, serialized, l1TtlSeconds),
      l2.set(key, serialized, l2TtlSeconds),
    ]);
  };

  const fetchJson = async (url) => {
    const response = await fetchFn(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`PokeAPI request failed (${response.status}) for ${url}`);
    return response.json();
  };

  const buildListItem = async (name) => {
    const pokemon = await fetchJson(`${baseUrl}/pokemon/${name}`);
    if (pokemon === null) return null;

    const species = await fetchJson(`${baseUrl}/pokemon-species/${pokemon.id}`);
    const englishGenus = species !== null ? pickEnglish(species.genera) : undefined;

    return {
      pokeApiId: pokemon.id,
      name: pokemon.name,
      spriteUrl: pickSprite(pokemon.sprites),
      category: englishGenus?.genus ?? null,
      weight: pokemon.weight,
      abilities: mapAbilities(pokemon.abilities),
    };
  };

  const getPokemonPage = async (page, pageSize) => {
    const key = `pokeapi:list:${page}:${pageSize}`;
    const cached = await readCache(key);
    if (cached !== null) return cached;

    const offset = (page - 1) * pageSize;
    const list = await fetchJson(`${baseUrl}/pokemon?offset=${offset}&limit=${pageSize}`);
    if (list === null) {
      return {
        items: [], page, pageSize, totalCount: 0,
      };
    }

    // allSettled (not all): a single transient failure among up to 2×pageSize concurrent
    // hydration calls must not fail the whole page. Rejected entries are dropped from the
    // response, but a page containing any rejection is a PARTIAL result and is never cached —
    // it is served once, and the next request retries hydration against the network.
    const settled = await Promise.allSettled(list.results.map((entry) => buildListItem(entry.name)));
    const hadRejection = settled.some((entry) => entry.status === 'rejected');
    const items = settled.filter(isFulfilled).map((entry) => entry.value).filter(isPresent);
    const result = {
      items, page, pageSize, totalCount: list.count,
    };

    if (!hadRejection) await writeCache(key, result);
    return result;
  };

  const getPokemonDetail = async (idOrName) => {
    const key = `pokeapi:pokemon:${idOrName}`;
    const cached = await readCache(key);
    if (cached !== null) return cached;

    const pokemon = await fetchJson(`${baseUrl}/pokemon/${idOrName}`);
    if (pokemon === null) return null;

    const species = await fetchJson(`${baseUrl}/pokemon-species/${pokemon.id}`);
    const englishGenus = species !== null ? pickEnglish(species.genera) : undefined;
    const englishFlavorText = species !== null ? pickEnglish(species.flavor_text_entries) : undefined;
    const description = englishFlavorText !== undefined ? englishFlavorText.flavor_text.replace(/\s+/g, ' ').trim() : null;

    const chain = species !== null ? await fetchJson(species.evolution_chain.url) : null;
    const evolutionChain = chain !== null ? flattenChain(chain.chain) : [];

    const stats = pokemon.stats.map((stat) => ({ name: stat.stat.name, value: stat.base_stat }));

    const detail = {
      pokeApiId: pokemon.id,
      name: pokemon.name,
      spriteUrl: pickSprite(pokemon.sprites),
      category: englishGenus?.genus ?? null,
      weight: pokemon.weight,
      height: pokemon.height,
      description,
      types: pokemon.types.map((type) => type.type.name),
      abilities: mapAbilities(pokemon.abilities),
      stats,
      evolutionChain,
    };

    await writeCache(key, detail);
    return detail;
  };

  return { getPokemonPage, getPokemonDetail };
};

export { createPokeApiClient };
