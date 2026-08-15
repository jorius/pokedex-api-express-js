// packages
import {
  describe, expect, it, jest,
} from '@jest/globals';

// cache
import { createMemoryCache } from '../../infrastructure/cache/MemoryCache.js';
// clients
import { createPokeApiClient } from '../../infrastructure/clients/PokeApiClient.js';

const BASE_URL = 'https://pokeapi.co/api/v2';

const bulbasaurPokemon = {
  id: 1,
  name: 'bulbasaur',
  weight: 69,
  height: 7,
  sprites: {
    front_default: 'sprite.png',
    other: {
      'official-artwork': {
        front_default: 'art.png',
      },
    },
  },
  abilities: [
    { ability: { name: 'overgrow' }, is_hidden: false, slot: 1 },
    { ability: { name: 'chlorophyll' }, is_hidden: true, slot: 3 },
  ],
  stats: [
    { base_stat: 45, stat: { name: 'hp' } },
  ],
  types: [
    { type: { name: 'grass' } },
  ],
  species: { url: `${BASE_URL}/pokemon-species/1/` },
};

const bulbasaurSpecies = {
  genera: [
    { genus: 'Pokémon semilla', language: { name: 'es' } },
    { genus: 'Seed Pokémon', language: { name: 'en' } },
  ],
  flavor_text_entries: [
    { flavor_text: 'A strange seed was\nplanted on its\fback at birth.', language: { name: 'en' } },
  ],
  evolution_chain: { url: `${BASE_URL}/evolution-chain/1/` },
};

const bulbasaurChain = {
  chain: {
    species: { name: 'bulbasaur' },
    evolves_to: [
      {
        species: { name: 'ivysaur' },
        evolves_to: [
          {
            species: { name: 'venusaur' },
            evolves_to: [],
          },
        ],
      },
    ],
  },
};

const pokemonListBody = {
  count: 1302,
  results: [
    { name: 'bulbasaur', url: `${BASE_URL}/pokemon/1/` },
  ],
};

const ivysaurPokemon = {
  id: 2,
  name: 'ivysaur',
  weight: 130,
  height: 10,
  sprites: {
    front_default: 'ivysaur-sprite.png',
  },
  abilities: [
    { ability: { name: 'overgrow' }, is_hidden: false, slot: 1 },
  ],
  stats: [
    { base_stat: 60, stat: { name: 'hp' } },
  ],
  types: [
    { type: { name: 'grass' } },
  ],
  species: { url: `${BASE_URL}/pokemon-species/2/` },
};

const eeveePokemon = {
  id: 133,
  name: 'eevee',
  weight: 65,
  height: 3,
  sprites: {
    front_default: 'eevee-sprite.png',
  },
  abilities: [
    { ability: { name: 'run-away' }, is_hidden: false, slot: 1 },
  ],
  stats: [
    { base_stat: 55, stat: { name: 'hp' } },
  ],
  types: [
    { type: { name: 'normal' } },
  ],
  species: { url: `${BASE_URL}/pokemon-species/133/` },
};

const eeveeSpecies = {
  genera: [
    { genus: 'Evolution Pokémon', language: { name: 'en' } },
  ],
  flavor_text_entries: [
    { flavor_text: 'It has the ability to alter the composition of its body.', language: { name: 'en' } },
  ],
  evolution_chain: { url: `${BASE_URL}/evolution-chain/67/` },
};

const eeveeChain = {
  chain: {
    species: { name: 'eevee' },
    evolves_to: [
      { species: { name: 'vaporeon' }, evolves_to: [] },
      { species: { name: 'jolteon' }, evolves_to: [] },
      { species: { name: 'flareon' }, evolves_to: [] },
    ],
  },
};

const twoItemListBody = {
  count: 1302,
  results: [
    { name: 'bulbasaur', url: `${BASE_URL}/pokemon/1/` },
    { name: 'ivysaur', url: `${BASE_URL}/pokemon/2/` },
  ],
};

/**
 * Giratina is the canonical form-only species: PokeAPI's /pokemon endpoint is keyed by variety,
 * and this species has NO variety named plainly `giratina`, so /pokemon/giratina 404s. The default
 * variety is deliberately NOT first in the list so a test that passes can only have honoured
 * `is_default` rather than having picked varieties[0] by luck.
 */
const giratinaSpecies = {
  genera: [
    { genus: 'Renegade Pokémon', language: { name: 'en' } },
  ],
  flavor_text_entries: [
    { flavor_text: 'It was banished for its\nviolence.', language: { name: 'en' } },
  ],
  evolution_chain: { url: `${BASE_URL}/evolution-chain/240/` },
  varieties: [
    { is_default: false, pokemon: { name: 'giratina-origin' } },
    { is_default: true, pokemon: { name: 'giratina-altered' } },
  ],
};

/** Same species with no variety flagged default — resolution must fall back to varieties[0]. */
const unflaggedGiratinaSpecies = {
  ...giratinaSpecies,
  varieties: [
    { is_default: false, pokemon: { name: 'giratina-altered' } },
    { is_default: false, pokemon: { name: 'giratina-origin' } },
  ],
};

const giratinaAlteredPokemon = {
  id: 487,
  name: 'giratina-altered',
  weight: 7500,
  height: 45,
  sprites: {
    front_default: 'giratina-sprite.png',
  },
  abilities: [
    { ability: { name: 'pressure' }, is_hidden: false, slot: 1 },
  ],
  stats: [
    { base_stat: 150, stat: { name: 'hp' } },
  ],
  types: [
    { type: { name: 'ghost' } },
    { type: { name: 'dragon' } },
  ],
  species: { url: `${BASE_URL}/pokemon-species/487/` },
};

const giratinaChain = {
  chain: {
    species: { name: 'giratina' },
    evolves_to: [],
  },
};

/**
 * A NON-DEFAULT variety, fetchable directly by name (unlike plain `giratina`) but whose numeric
 * pokemon id (the real PokeAPI id for giratina-origin) has NO species resource of its own — only
 * `species.url` (pointing at the shared giratina species, id 487) is a valid species link.
 */
const giratinaOriginPokemon = {
  id: 10007,
  name: 'giratina-origin',
  weight: 6500,
  height: 45,
  sprites: {
    front_default: 'giratina-origin-sprite.png',
  },
  abilities: [
    { ability: { name: 'levitate' }, is_hidden: false, slot: 1 },
  ],
  stats: [
    { base_stat: 150, stat: { name: 'hp' } },
  ],
  types: [
    { type: { name: 'ghost' } },
    { type: { name: 'dragon' } },
  ],
  species: { url: `${BASE_URL}/pokemon-species/487/` },
};

/**
 * A browse page whose second entry is a NON-DEFAULT variety — exactly what a page of PokeAPI's
 * variety-keyed /pokemon list looks like once it reaches the form range.
 */
const varietyListBody = {
  count: 1302,
  results: [
    { name: 'bulbasaur', url: `${BASE_URL}/pokemon/1/` },
    { name: 'giratina-origin', url: `${BASE_URL}/pokemon/10007/` },
  ],
};

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const notFoundResponse = () => ({
  ok: false,
  status: 404,
  json: async () => ({}),
});

const badRequestResponse = () => ({
  ok: false,
  status: 400,
  json: async () => ({}),
});

const serverErrorResponse = () => ({
  ok: false,
  status: 500,
  json: async () => ({}),
});

const createRouteFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon-species/')) return jsonResponse(bulbasaurSpecies);
  if (url.includes('/evolution-chain/')) return jsonResponse(bulbasaurChain);
  if (url.includes('/pokemon?')) return jsonResponse(pokemonListBody);
  if (url.includes('/pokemon/')) return jsonResponse(bulbasaurPokemon);
  throw new Error(`Unexpected fetch: ${url}`);
});

/** Two-item list where ivysaur's species fetch always fails with a transient 500. */
const createPartialFailureFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon-species/2')) return serverErrorResponse();
  if (url.includes('/pokemon-species/')) return jsonResponse(bulbasaurSpecies);
  if (url.includes('/pokemon?')) return jsonResponse(twoItemListBody);
  if (url.includes('/pokemon/bulbasaur')) return jsonResponse(bulbasaurPokemon);
  if (url.includes('/pokemon/ivysaur')) return jsonResponse(ivysaurPokemon);
  throw new Error(`Unexpected fetch: ${url}`);
});

/** Bulbasaur's own pokemon-species fetch always fails with a transient 500. */
const createDetailFailureFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon-species/')) return serverErrorResponse();
  if (url.includes('/pokemon/')) return jsonResponse(bulbasaurPokemon);
  throw new Error(`Unexpected fetch: ${url}`);
});

/**
 * A form-only species: /pokemon/giratina 404s, /pokemon-species/giratina resolves, and only the
 * suffixed variety name is fetchable from /pokemon. The `-altered` route is matched FIRST because
 * the plain-name route is a prefix of it.
 */
const createFormOnlyFetch = (species = giratinaSpecies) => jest.fn(async (url) => {
  if (url.includes('/pokemon/giratina-altered')) return jsonResponse(giratinaAlteredPokemon);
  if (url.includes('/pokemon/giratina')) return notFoundResponse();
  if (url.includes('/pokemon-species/giratina')) return jsonResponse(species);
  if (url.includes('/pokemon-species/')) return jsonResponse(species);
  if (url.includes('/evolution-chain/')) return jsonResponse(giratinaChain);
  throw new Error(`Unexpected fetch: ${url}`);
});

const createEeveeFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon-species/')) return jsonResponse(eeveeSpecies);
  if (url.includes('/evolution-chain/')) return jsonResponse(eeveeChain);
  if (url.includes('/pokemon/')) return jsonResponse(eeveePokemon);
  throw new Error(`Unexpected fetch: ${url}`);
});

/**
 * giratina-origin resolves directly (no fallback needed) but its numeric id (10007) has no
 * species resource — only species.url (pokemon-species/487) does. A client that still constructs
 * the species URL from pokemon.id would 404 here and silently degrade category/description/chain.
 */
const createNonDefaultVarietyFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon/giratina-origin')) return jsonResponse(giratinaOriginPokemon);
  if (url.includes('/pokemon-species/10007')) return notFoundResponse();
  if (url.includes('/pokemon-species/487')) return jsonResponse(giratinaSpecies);
  if (url.includes('/evolution-chain/')) return jsonResponse(giratinaChain);
  throw new Error(`Unexpected fetch: ${url}`);
});

/**
 * A browse page containing a non-default variety. `/pokemon-species/10007` 404s exactly as the
 * real API does, so a list hydrator that builds the species URL from pokemon.id degrades that
 * entry to `category: null`, while the species.url route (pokemon-species/487) resolves it.
 */
const createVarietyListFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon?')) return jsonResponse(varietyListBody);
  if (url.includes('/pokemon/giratina-origin')) return jsonResponse(giratinaOriginPokemon);
  if (url.includes('/pokemon/bulbasaur')) return jsonResponse(bulbasaurPokemon);
  if (url.includes('/pokemon-species/10007')) return notFoundResponse();
  if (url.includes('/pokemon-species/487')) return jsonResponse(giratinaSpecies);
  if (url.includes('/pokemon-species/')) return jsonResponse(bulbasaurSpecies);
  throw new Error(`Unexpected fetch: ${url}`);
});

/** Same page, but the variety's OWN species link 404s — the item must still hydrate, category null. */
const createVarietyListMissingSpeciesFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon?')) return jsonResponse(varietyListBody);
  if (url.includes('/pokemon/giratina-origin')) return jsonResponse(giratinaOriginPokemon);
  if (url.includes('/pokemon/bulbasaur')) return jsonResponse(bulbasaurPokemon);
  if (url.includes('/pokemon-species/487')) return notFoundResponse();
  if (url.includes('/pokemon-species/')) return jsonResponse(bulbasaurSpecies);
  throw new Error(`Unexpected fetch: ${url}`);
});

describe('PokeApiClient', () => {
  it('assembles a browse page from the list, pokemon and species endpoints', async () => {
    const fetchFn = createRouteFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const page = await client.getPokemonPage(1, 20);

    expect(page.totalCount).toBe(1302);
    expect(page.items[0]).toMatchObject({
      pokeApiId: 1,
      name: 'bulbasaur',
      spriteUrl: 'art.png',
      category: 'Seed Pokémon',
      weight: 69,
    });
    expect(page.items[0]?.abilities).toEqual([
      { name: 'overgrow', slot: 1, isHidden: false },
      { name: 'chlorophyll', slot: 3, isHidden: true },
    ]);
  });

  it('hydrates a browse page entry that is a non-default variety via pokemon.species.url', async () => {
    const fetchFn = createVarietyListFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const page = await client.getPokemonPage(1, 20);

    expect(page.items.map((item) => item.name)).toEqual(['bulbasaur', 'giratina-origin']);
    expect(page.items[1]).toMatchObject({
      pokeApiId: 10007,
      name: 'giratina-origin',
      category: 'Renegade Pokémon',
      weight: 6500,
    });
    // The species id (487), never the pokemon id (10007), is what the hydrator asked for.
    expect(fetchFn.mock.calls.map(([url]) => url)).toContain(`${BASE_URL}/pokemon-species/487/`);
    expect(fetchFn.mock.calls.map(([url]) => url)).not.toContain(`${BASE_URL}/pokemon-species/10007`);
  });

  it('keeps a browse page item with a null category when its species link 404s', async () => {
    const fetchFn = createVarietyListMissingSpeciesFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const page = await client.getPokemonPage(1, 20);

    expect(page.items.map((item) => item.name)).toEqual(['bulbasaur', 'giratina-origin']);
    expect(page.items[1]).toMatchObject({ name: 'giratina-origin', category: null });
  });

  it('serves a repeated identical page from cache without additional fetches', async () => {
    const fetchFn = createRouteFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    await client.getPokemonPage(1, 20);
    const callCountAfterFirst = fetchFn.mock.calls.length;
    await client.getPokemonPage(1, 20);

    expect(fetchFn.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('assembles pokemon detail with normalized description, types, stats and evolution chain', async () => {
    const fetchFn = createRouteFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('bulbasaur');

    expect(detail?.description).toBe('A strange seed was planted on its back at birth.');
    expect(detail?.types).toEqual(['grass']);
    expect(detail?.evolutionChain).toEqual(['bulbasaur', 'ivysaur', 'venusaur']);
    expect(detail?.stats).toEqual([{ name: 'hp', value: 45 }]);
    expect(detail?.height).toBe(7);
  });

  it('resolves null for an unknown pokemon and does not cache the miss', async () => {
    const fetchFn = jest.fn(async () => notFoundResponse());
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const first = await client.getPokemonDetail('missingno');
    expect(first).toBeNull();
    const callCountAfterFirst = fetchFn.mock.calls.length;

    const second = await client.getPokemonDetail('missingno');
    expect(second).toBeNull();
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  it('hydrates from the shared L2 cache with zero additional fetches for a fresh L1', async () => {
    const sharedL2 = createMemoryCache();
    const fetchFn = createRouteFetch();

    const firstClient = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: sharedL2,
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });
    await firstClient.getPokemonDetail('bulbasaur');
    const callCountAfterFirst = fetchFn.mock.calls.length;

    const secondClient = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: sharedL2,
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });
    const detail = await secondClient.getPokemonDetail('bulbasaur');

    expect(detail?.name).toBe('bulbasaur');
    expect(fetchFn.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('drops items whose hydration fails and does not cache the resulting partial page', async () => {
    const fetchFn = createPartialFailureFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const page = await client.getPokemonPage(1, 20);
    expect(page.items.map((item) => item.name)).toEqual(['bulbasaur']);

    const callCountAfterFirst = fetchFn.mock.calls.length;
    await client.getPokemonPage(1, 20);
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  it('rejects when detail assembly hits a transient failure and does not cache anything', async () => {
    const fetchFn = createDetailFailureFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    await expect(client.getPokemonDetail('bulbasaur')).rejects.toThrow();

    const callCountAfterFirst = fetchFn.mock.calls.length;
    await expect(client.getPokemonDetail('bulbasaur')).rejects.toThrow();
    expect(fetchFn.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });

  it('falls through to network when a cache tier holds a corrupt entry', async () => {
    const fetchFn = createRouteFetch();
    const l1 = createMemoryCache();
    await l1.set('pokeapi:pokemon:bulbasaur', '{not-valid-json', 300);

    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1,
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('bulbasaur');

    expect(detail?.name).toBe('bulbasaur');
    expect(fetchFn.mock.calls.length).toBeGreaterThan(0);
  });

  it('flattens a branching evolution chain in DFS pre-order', async () => {
    const fetchFn = createEeveeFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('eevee');

    expect(detail?.evolutionChain).toEqual(['eevee', 'vaporeon', 'jolteon', 'flareon']);
  });

  it('resolves a form-only species name through its default variety', async () => {
    const fetchFn = createFormOnlyFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('giratina');

    expect(detail?.pokeApiId).toBe(487);
    expect(detail?.name).toBe('giratina-altered');
    expect(detail?.category).toBe('Renegade Pokémon');
    expect(detail?.description).toBe('It was banished for its violence.');
    expect(detail?.types).toEqual(['ghost', 'dragon']);
    expect(detail?.evolutionChain).toEqual(['giratina']);
  });

  it('falls back to the first variety when the species flags none as default', async () => {
    const fetchFn = createFormOnlyFetch(unflaggedGiratinaSpecies);
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('giratina');

    expect(detail?.name).toBe('giratina-altered');
  });

  it('spends exactly one extra request on the fallback and reuses the species it already fetched', async () => {
    const fetchFn = createFormOnlyFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    await client.getPokemonDetail('giratina');

    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      `${BASE_URL}/pokemon/giratina`,
      `${BASE_URL}/pokemon-species/giratina`,
      `${BASE_URL}/pokemon/giratina-altered`,
      `${BASE_URL}/evolution-chain/240/`,
    ]);
  });

  it('never probes the species endpoint by name when the pokemon lookup hits directly', async () => {
    const fetchFn = createRouteFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    await client.getPokemonDetail('bulbasaur');

    // pokemon-species/1/ (trailing slash) — not a hand-built pokemon-species/{id} — because the
    // species URL always comes from pokemon.species.url now (see the non-default-variety test).
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      `${BASE_URL}/pokemon/bulbasaur`,
      `${BASE_URL}/pokemon-species/1/`,
      `${BASE_URL}/evolution-chain/1/`,
    ]);
  });

  it('resolves null when the pokemon and the species lookups both miss', async () => {
    const fetchFn = jest.fn(async () => notFoundResponse());
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('notapokemonxyz');

    expect(detail).toBeNull();
    expect(fetchFn.mock.calls.length).toBe(2);
  });

  it('caches a fallback-resolved detail under the requested name', async () => {
    const fetchFn = createFormOnlyFetch();
    const l1 = createMemoryCache();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1,
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    await client.getPokemonDetail('giratina');
    const callCountAfterFirst = fetchFn.mock.calls.length;
    const second = await client.getPokemonDetail('giratina');

    expect(second?.name).toBe('giratina-altered');
    expect(fetchFn.mock.calls.length).toBe(callCountAfterFirst);
    expect(await l1.get('pokeapi:pokemon:giratina')).not.toBeNull();
  });

  it('resolves a non-default variety with its species data via pokemon.species.url, not /pokemon-species/{id}', async () => {
    const fetchFn = createNonDefaultVarietyFetch();
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail('giratina-origin');

    expect(detail?.pokeApiId).toBe(10007);
    expect(detail?.category).toBe('Renegade Pokémon');
    expect(detail?.description).toBe('It was banished for its violence.');
    expect(detail?.evolutionChain).toEqual(['giratina']);
  });

  it('resolves null (not a throw) when PokeAPI answers 400 for a punctuated name, on both the direct and species-fallback lookups', async () => {
    const fetchFn = jest.fn(async () => badRequestResponse());
    const client = createPokeApiClient({
      baseUrl: BASE_URL,
      l1: createMemoryCache(),
      l2: createMemoryCache(),
      l1TtlSeconds: 300,
      l2TtlSeconds: 3600,
      fetchFn,
    });

    const detail = await client.getPokemonDetail("farfetch'd");

    expect(detail).toBeNull();
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      `${BASE_URL}/pokemon/farfetch'd`,
      `${BASE_URL}/pokemon-species/farfetch'd`,
    ]);
  });
});
