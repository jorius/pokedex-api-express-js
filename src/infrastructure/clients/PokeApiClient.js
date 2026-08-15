/**
 * Gateway to the external PokeAPI (https://pokeapi.co/docs/v2).
 * SINGLETON: the composition root (src/Container.js) creates exactly
 * one instance per process — ESM module evaluation guarantees the container runs
 * once, so this is the singleton pattern chosen for external API consumption.
 *
 * Two-tier read-through cache on ASSEMBLED results:
 *   L1 (memory, short TTL) → L2 (shared Redis, long TTL) → network.
 * Key scheme is shared verbatim by all three backend services:
 *   pokeapi:v2:list:{page}:{pageSize}   pokeapi:v2:pokemon:{idOrName}
 *
 * The `v2` segment VERSIONS THE ASSEMBLED SHAPE, not the PokeAPI version. It was
 * introduced with shinySpriteUrl: entries written under the old `pokeapi:list:…` /
 * `pokeapi:pokemon:…` keys hold payloads that predate the field, so bumping the key
 * scheme retires them all at once instead of serving a stale shape until their TTL
 * expires. All three services must bump together — the scheme is part of the
 * cross-service contract. Any future field addition bumps it again.
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

/**
 * Shiny counterpart of pickSprite, with the SAME precedence: the high-resolution
 * official artwork first, the low-resolution top-level sprite as the fallback, null
 * when PokeAPI has neither (plenty of forms and newer entries ship no shiny artwork).
 */
const pickShinySprite = (sprites) => sprites.other?.['official-artwork']?.front_shiny ?? sprites.front_shiny ?? null;

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

/** Picks the species' default variety, tolerating a species whose varieties flag none as default. */
const pickDefaultVariety = (species) => {
  const varieties = species.varieties ?? [];
  return varieties.find((variety) => variety.is_default) ?? varieties[0];
};

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

  const fetchJson = async (url, treatBadRequestAsNotFound = false) => {
    const response = await fetchFn(url);
    if (response.status === 404) return null;
    // PokeAPI answers 400 (not 404) for a name it cannot route at all — an apostrophe, a period
    // or a bare space breaks its path-segment matching (farfetch'd, mr. mime, ho oh) — which is a
    // user SPELLING problem, not a malformed request we built. For name-keyed lookups that 400 is
    // therefore folded into the same "not found" outcome as a 404 instead of surfacing as a 500;
    // callers that pass an internally-constructed URL (ids, evolution-chain links) leave this off
    // so a genuine 400 there still propagates as the error it is.
    if (treatBadRequestAsNotFound && response.status === 400) return null;
    if (!response.ok) throw new Error(`PokeAPI request failed (${response.status}) for ${url}`);
    return response.json();
  };

  const buildListItem = async (name) => {
    const pokemon = await fetchJson(`${baseUrl}/pokemon/${name}`);
    if (pokemon === null) return null;

    // Same authoritative link the detail path uses: a browse page is a page of VARIETIES, and a
    // non-default variety's numeric id (giratina-origin is 10007) has no species resource of its
    // own, so a hand-built `/pokemon-species/{pokemon.id}` 404s and silently drops `category`.
    // A genuinely absent species still degrades gracefully to `category: null` (a 404 here is a
    // null species, not a throw), while a transient 5xx still rejects and drops the whole item.
    const species = await fetchJson(pokemon.species.url);
    const englishGenus = species !== null ? pickEnglish(species.genera) : undefined;

    return {
      pokeApiId: pokemon.id,
      name: pokemon.name,
      spriteUrl: pickSprite(pokemon.sprites),
      shinySpriteUrl: pickShinySprite(pokemon.sprites),
      category: englishGenus?.genus ?? null,
      weight: pokemon.weight,
      abilities: mapAbilities(pokemon.abilities),
    };
  };

  const getPokemonPage = async (page, pageSize) => {
    const key = `pokeapi:v2:list:${page}:${pageSize}`;
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

  /**
   * PokeAPI's /pokemon endpoint is keyed by VARIETY, not by species. A species whose forms all
   * carry a suffix has NO variety named plainly after the species — giratina resolves only as
   * giratina-altered / giratina-origin — so /pokemon/giratina 404s even though the pokemon exists
   * (same for deoxys, shaymin, wormadam, darmanitan, basculin, urshifu and friends), and users
   * naturally search the plain name. On a 404 we therefore retry through /pokemon-species/{name}
   * and take its DEFAULT variety; if the species 404s too the pokemon genuinely does not exist.
   *
   * The fallback costs exactly ONE extra request on the miss path and NONE when the first lookup
   * succeeds, so numeric-id and exact-variety-name lookups are completely unaffected: the species
   * body fetched here is returned to the caller and reused for assembly instead of being fetched a
   * second time by id (a default variety's pokemon.id EQUALS its species id, so it is the very
   * same resource). A `null` species in the result simply means "not fetched yet, assemble as usual".
   */
  const resolvePokemon = async (idOrName) => {
    const direct = await fetchJson(`${baseUrl}/pokemon/${idOrName}`, true);
    if (direct !== null) return { pokemon: direct, species: null };

    const species = await fetchJson(`${baseUrl}/pokemon-species/${idOrName}`, true);
    if (species === null) return null;

    const defaultVariety = pickDefaultVariety(species);
    if (defaultVariety === undefined) return null;

    const pokemon = await fetchJson(`${baseUrl}/pokemon/${defaultVariety.pokemon.name}`);
    return pokemon !== null ? { pokemon, species } : null;
  };

  const getPokemonDetail = async (idOrName) => {
    const key = `pokeapi:v2:pokemon:${idOrName}`;
    const cached = await readCache(key);
    if (cached !== null) return cached;

    const resolved = await resolvePokemon(idOrName);
    if (resolved === null) return null;

    const { pokemon } = resolved;
    // pokemon.species.url (not `/pokemon-species/{pokemon.id}`) is the authoritative link: a
    // NON-DEFAULT variety's numeric id (giratina-origin is 10007) has no species resource of its
    // own, so constructing the URL from the id 404s and silently drops category/description/chain.
    // The species resource is keyed by the SPECIES id, which pokemon.species.url already encodes.
    const species = resolved.species ?? await fetchJson(pokemon.species.url);
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
      shinySpriteUrl: pickShinySprite(pokemon.sprites),
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
