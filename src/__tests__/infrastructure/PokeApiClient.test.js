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

const createEeveeFetch = () => jest.fn(async (url) => {
  if (url.includes('/pokemon-species/')) return jsonResponse(eeveeSpecies);
  if (url.includes('/evolution-chain/')) return jsonResponse(eeveeChain);
  if (url.includes('/pokemon/')) return jsonResponse(eeveePokemon);
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
});
