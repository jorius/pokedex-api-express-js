// packages
import {
  beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// services
import { createPokemonsService } from '../../application/services/PokemonsService.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Rolls that force a deterministic outcome: 0 always catches, ~1 always escapes. */
const ALWAYS_CATCHES = () => 0;
const ALWAYS_ESCAPES = () => 0.9999999;

const detail = {
  pokeApiId: 1,
  name: 'bulbasaur',
  spriteUrl: 'art.png',
  category: 'Seed Pokémon',
  weight: 69,
  height: 7,
  description: 'A strange seed.',
  types: ['grass'],
  abilities: [{ name: 'overgrow', slot: 1, isHidden: false }],
  stats: [{ name: 'hp', value: 45 }],
  evolutionChain: ['bulbasaur', 'ivysaur', 'venusaur'],
};

// Slots deliberately out of order — mirrors how a re-sync can hand the repository abilities
// in whatever order Postgres's heap happens to return them in.
const shuffledAbilitiesDetail = {
  pokeApiId: 7,
  name: 'squirtle',
  spriteUrl: 'squirtle.png',
  category: 'Tiny Turtle Pokémon',
  weight: 90,
  height: 5,
  description: 'Shoots water at prey.',
  types: ['water'],
  abilities: [
    { name: 'rain-dish', slot: 3, isHidden: true },
    { name: 'torrent', slot: 1, isHidden: false },
    { name: 'shell-armor', slot: 2, isHidden: false },
  ],
  stats: [{ name: 'hp', value: 44 }],
  evolutionChain: ['squirtle', 'wartortle', 'blastoise'],
};

// A legendary with a real base stat total (680): rarity ×0.35 regardless of BST.
const legendaryDetail = {
  pokeApiId: 150,
  name: 'mewtwo',
  spriteUrl: 'mewtwo.png',
  category: 'Genetic Pokémon',
  weight: 1220,
  height: 20,
  description: 'Created by genetic manipulation.',
  types: ['psychic'],
  abilities: [{ name: 'pressure', slot: 1, isHidden: false }],
  stats: [
    { name: 'hp', value: 106 },
    { name: 'attack', value: 110 },
    { name: 'defense', value: 90 },
    { name: 'special-attack', value: 154 },
    { name: 'special-defense', value: 90 },
    { name: 'speed', value: 130 },
  ],
  evolutionChain: ['mewtwo'],
};

const local = {
  id: '4b36c8a7-3d61-4bfe-a437-95b3ef1478f6',
  pokeApiId: 1,
  name: 'bulbasaur',
  spriteUrl: 'art.png',
  category: 'Seed Pokémon',
  weight: 69,
  description: 'A strange seed.',
  localizedName: null,
  region: null,
  classificationTag: null,
  abilities: [],
  capturedAt: '2026-08-14T00:00:00.000Z',
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z',
};

const createPokeApiClientMock = () => ({
  getPokemonPage: jest.fn(),
  getPokemonDetail: jest.fn(),
});

const createPokemonsRepositoryMock = () => ({
  upsertFromDetail: jest.fn(),
  findPage: jest.fn(),
  findByPokeApiId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

/**
 * Ball ledger stand-in for the catch flow. Only consumeBall matters here — the
 * rest of the economy port is exercised by EconomyService.test.js — and it
 * keeps the adapter's guard semantics: null when there is nothing to consume.
 */
const createFakeBallLedger = (stock = { poke: 10 }) => {
  const held = new Map(Object.entries(stock));
  const consumed = [];

  return {
    stock: held,
    consumed,
    consumeBall: async (_userId, ballType) => {
      const remaining = held.get(ballType) ?? 0;
      if (remaining < 1) return null;
      held.set(ballType, remaining - 1);
      consumed.push(ballType);
      return remaining - 1;
    },
    getWallet: async () => null,
    purchase: async () => null,
    applySpin: async () => null,
    findSpinPage: async () => ({
      items: [], page: 1, pageSize: 20, totalCount: 0,
    }),
  };
};

/**
 * In-memory fake with the same ownership semantics as the Drizzle adapter:
 * pokemons are a shared replica keyed by pokeApiId; collection entries are
 * unique per (userId, pokemonId) and every read/update/delete filters by
 * userId. Used to test isolation and idempotency at the repository contract
 * level without a live database.
 */
const createInMemoryRepository = () => {
  const shared = new Map();
  const entries = [];
  let sequence = 0;

  const nextId = () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  };

  const toLocal = (entry) => {
    const pokemon = shared.get(entry.pokeApiId);
    return {
      id: entry.id,
      pokeApiId: pokemon.pokeApiId,
      name: pokemon.name,
      spriteUrl: pokemon.spriteUrl,
      category: pokemon.category,
      weight: pokemon.weight,
      description: entry.description ?? pokemon.description,
      localizedName: entry.localizedName,
      region: entry.region,
      classificationTag: entry.classificationTag,
      abilities: pokemon.abilities,
      capturedAt: entry.capturedAt.toISOString(),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  };

  return {
    upsertFromDetail: async (userId, incoming) => {
      // Sorted by slot, mirroring the Drizzle adapter's deterministic ordering fix.
      const sortedAbilities = [...incoming.abilities].sort((a, b) => a.slot - b.slot);
      const normalized = { ...incoming, abilities: sortedAbilities };
      shared.set(normalized.pokeApiId, normalized);
      const existing = entries.find((entry) => entry.userId === userId && entry.pokeApiId === normalized.pokeApiId);
      if (existing) {
        existing.updatedAt = new Date();
        return toLocal(existing);
      }
      const now = new Date();
      const created = {
        id: nextId(),
        userId,
        pokeApiId: normalized.pokeApiId,
        localizedName: null,
        region: null,
        classificationTag: null,
        description: null,
        capturedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      entries.push(created);
      return toLocal(created);
    },

    findPage: async (userId, page, pageSize) => {
      const mine = entries.filter((entry) => entry.userId === userId);
      const offset = (page - 1) * pageSize;
      return {
        items: mine.slice(offset, offset + pageSize).map(toLocal),
        page,
        pageSize,
        totalCount: mine.length,
      };
    },

    findByPokeApiId: async (userId, pokeApiId) => {
      const found = entries.find((entry) => entry.userId === userId && entry.pokeApiId === pokeApiId);
      return found ? toLocal(found) : null;
    },

    update: async (userId, id, payload) => {
      const found = entries.find((entry) => entry.userId === userId && entry.id === id);
      if (!found) return null;
      Object.assign(found, payload, { updatedAt: new Date() });
      return toLocal(found);
    },

    delete: async (userId, id) => {
      const index = entries.findIndex((entry) => entry.userId === userId && entry.id === id);
      if (index === -1) return false;
      entries.splice(index, 1);
      return true;
    },
  };
};

describe('PokemonsService', () => {
  let pokeApiClient;
  let pokemonsRepository;
  let economyRepository;
  let service;

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokemonsRepository = createPokemonsRepositoryMock();
    economyRepository = createFakeBallLedger();
    service = createPokemonsService({
      pokeApiClient,
      pokemonsRepository,
      economyRepository,
      random: ALWAYS_CATCHES,
    });
  });

  it('browse delegates to the PokeAPI client', async () => {
    const page = {
      items: [], page: 2, pageSize: 10, totalCount: 0,
    };
    pokeApiClient.getPokemonPage.mockResolvedValueOnce(page);

    const result = await service.browse(2, 10);

    expect(pokeApiClient.getPokemonPage).toHaveBeenCalledWith(2, 10);
    expect(result).toBe(page);
  });

  it('browse rejects invalid pagination', async () => {
    await expect(service.browse(0, 20)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1, 101)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.browse(1.5, 20)).rejects.toBeInstanceOf(ValidationError);

    expect(pokeApiClient.getPokemonPage).not.toHaveBeenCalled();
  });

  it('getDetailById returns detail and 404s on miss', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);

    const result = await service.getDetailById(1);

    expect(pokeApiClient.getPokemonDetail).toHaveBeenCalledWith('1');
    expect(result).toBe(detail);

    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);
    await expect(service.getDetailById(1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('getDetailById rejects non-positive or non-integer ids', async () => {
    await expect(service.getDetailById(0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailById(-3)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailById(2.5)).rejects.toBeInstanceOf(ValidationError);

    expect(pokeApiClient.getPokemonDetail).not.toHaveBeenCalled();
  });

  it('getDetailByName normalizes the name and 404s on miss', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);

    const result = await service.getDetailByName('  Bulbasaur ');

    expect(pokeApiClient.getPokemonDetail).toHaveBeenCalledWith('bulbasaur');
    expect(result).toBe(detail);

    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);
    await expect(service.getDetailByName('missingno')).rejects.toBeInstanceOf(NotFoundError);

    await expect(service.getDetailByName('')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getDetailByName('   ')).rejects.toBeInstanceOf(ValidationError);
  });

  it('syncById fetches then upserts for the calling user', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(detail);
    pokemonsRepository.upsertFromDetail.mockResolvedValueOnce(local);

    const result = await service.syncById(USER_A, 1);

    expect(pokemonsRepository.upsertFromDetail).toHaveBeenCalledWith(USER_A, detail);
    expect(result.caught).toBe(true);
    expect(result.entry).toBe(local);
  });

  it('syncByName does not upsert when the PokeAPI lookup misses, and costs no ball', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);

    await expect(service.syncByName(USER_A, 'missingno')).rejects.toBeInstanceOf(NotFoundError);
    expect(pokemonsRepository.upsertFromDetail).not.toHaveBeenCalled();
    expect(economyRepository.consumed).toEqual([]);
    expect(economyRepository.stock.get('poke')).toBe(10);
  });

  it('getLocal delegates with the user id and validated pagination', async () => {
    const page = {
      items: [local], page: 1, pageSize: 20, totalCount: 1,
    };
    pokemonsRepository.findPage.mockResolvedValueOnce(page);

    const result = await service.getLocal(USER_A, 1, 20);

    expect(pokemonsRepository.findPage).toHaveBeenCalledWith(USER_A, 1, 20);
    expect(result).toBe(page);

    await expect(service.getLocal(USER_A, 0, 20)).rejects.toBeInstanceOf(ValidationError);
  });

  it('getLocalByPokeApiId returns the entry, validates the id and 404s on miss', async () => {
    pokemonsRepository.findByPokeApiId.mockResolvedValueOnce(local);

    const result = await service.getLocalByPokeApiId(USER_A, 1);

    expect(pokemonsRepository.findByPokeApiId).toHaveBeenCalledWith(USER_A, 1);
    expect(result).toBe(local);

    await expect(service.getLocalByPokeApiId(USER_A, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getLocalByPokeApiId(USER_A, 2.5)).rejects.toBeInstanceOf(ValidationError);

    pokemonsRepository.findByPokeApiId.mockResolvedValueOnce(null);
    await expect(service.getLocalByPokeApiId(USER_A, 99)).rejects.toThrow("Local pokemon with key '99' was not found");
  });

  it('update validates id format, payload shape and 404s on miss', async () => {
    await expect(service.update(USER_A, 'not-a-uuid', { region: 'Kanto' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(USER_A, local.id, {})).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(USER_A, local.id, { nickname: 'x' })).rejects.toBeInstanceOf(ValidationError);
    await expect(service.update(USER_A, local.id, { region: 'a'.repeat(501) })).rejects.toBeInstanceOf(ValidationError);
    expect(pokemonsRepository.update).not.toHaveBeenCalled();

    pokemonsRepository.update.mockResolvedValueOnce(null);
    await expect(service.update(USER_A, local.id, { region: 'Kanto' })).rejects.toBeInstanceOf(NotFoundError);

    pokemonsRepository.update.mockResolvedValueOnce(local);
    const result = await service.update(USER_A, local.id, {
      region: 'Kanto', localizedName: 'Bulbasaur', extra: 'ignored',
    });

    expect(pokemonsRepository.update).toHaveBeenCalledWith(USER_A, local.id, { region: 'Kanto', localizedName: 'Bulbasaur' });
    expect(result).toBe(local);
  });

  it('remove validates the id and 404s on miss', async () => {
    await expect(service.remove(USER_A, 'not-a-uuid')).rejects.toBeInstanceOf(ValidationError);
    expect(pokemonsRepository.delete).not.toHaveBeenCalled();

    pokemonsRepository.delete.mockResolvedValueOnce(false);
    await expect(service.remove(USER_A, local.id)).rejects.toBeInstanceOf(NotFoundError);

    pokemonsRepository.delete.mockResolvedValueOnce(true);
    await service.remove(USER_A, local.id);

    expect(pokemonsRepository.delete).toHaveBeenCalledWith(USER_A, local.id);
  });
});

describe('PokemonsService with in-memory repository (ownership semantics)', () => {
  let pokeApiClient;
  let service;

  // These tests are about ownership, not odds: the roll is pinned to always
  // catch and the ball ledger is stocked deep enough that no test runs dry.
  const capture = async (userId, id) => {
    const result = await service.syncById(userId, id);
    expect(result.caught).toBe(true);
    return result.entry;
  };

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokeApiClient.getPokemonDetail.mockImplementation(
      async (idOrName) => (idOrName === '7' ? shuffledAbilitiesDetail : detail),
    );
    service = createPokemonsService({
      pokeApiClient,
      pokemonsRepository: createInMemoryRepository(),
      economyRepository: createFakeBallLedger({ poke: 100 }),
      random: ALWAYS_CATCHES,
    });
  });

  it('re-syncing is idempotent: same entry id, no duplicates', async () => {
    const first = await capture(USER_A, 1);
    const second = await capture(USER_A, 1);

    expect(second.id).toBe(first.id);
    expect(second.capturedAt).toBe(first.capturedAt);

    const mine = await service.getLocal(USER_A, 1, 20);
    expect(mine.totalCount).toBe(1);
    expect(mine.items).toHaveLength(1);
  });

  it('re-syncing preserves proprietary fields on the entry', async () => {
    const entry = await capture(USER_A, 1);
    await service.update(USER_A, entry.id, { localizedName: 'Semillita' });

    const resynced = await capture(USER_A, 1);

    expect(resynced.id).toBe(entry.id);
    expect(resynced.localizedName).toBe('Semillita');
  });

  it('collections are isolated per user', async () => {
    const entryA = await capture(USER_A, 1);

    const forB = await service.getLocal(USER_B, 1, 20);
    expect(forB.totalCount).toBe(0);
    expect(forB.items).toHaveLength(0);

    await expect(service.getLocalByPokeApiId(USER_B, 1)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.update(USER_B, entryA.id, { region: 'Kanto' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.remove(USER_B, entryA.id)).rejects.toBeInstanceOf(NotFoundError);

    // A's entry is untouched by B's failed attempts.
    const forA = await service.getLocal(USER_A, 1, 20);
    expect(forA.totalCount).toBe(1);
    expect(forA.items[0].id).toBe(entryA.id);
    expect(forA.items[0].region).toBeNull();
  });

  it('both users can capture the same pokemon independently', async () => {
    const entryA = await capture(USER_A, 1);
    const entryB = await capture(USER_B, 1);

    expect(entryB.id).not.toBe(entryA.id);

    await service.update(USER_A, entryA.id, { localizedName: 'Semillita' });

    const b = await service.getLocalByPokeApiId(USER_B, 1);
    expect(b.localizedName).toBeNull();
  });

  it('getLocalByPokeApiId returns the caller entry with joined base fields', async () => {
    const entry = await capture(USER_A, 1);

    const found = await service.getLocalByPokeApiId(USER_A, 1);

    expect(found.id).toBe(entry.id);
    expect(found.name).toBe('bulbasaur');
    expect(found.description).toBe('A strange seed.');
    expect(found.capturedAt).toBe(entry.capturedAt);
  });

  it('the entry description overrides the shared flavor text when set', async () => {
    const entry = await capture(USER_A, 1);

    const updated = await service.update(USER_A, entry.id, { description: 'My own note.' });
    expect(updated.description).toBe('My own note.');

    // The shared pokemon keeps its flavor text for other users.
    const entryB = await capture(USER_B, 1);
    expect(entryB.description).toBe('A strange seed.');
  });

  it('abilities come back slot-ordered even when the source array is shuffled', async () => {
    const synced = await capture(USER_A, 7);
    expect(synced.abilities.map((a) => a.slot)).toEqual([1, 2, 3]);
    expect(synced.abilities.map((a) => a.name)).toEqual(['torrent', 'shell-armor', 'rain-dish']);

    // A later read agrees with the fresh sync, not just the sync response itself.
    const found = await service.getLocalByPokeApiId(USER_A, 7);
    expect(found.abilities.map((a) => a.slot)).toEqual([1, 2, 3]);
  });
});

describe('PokemonsService catch flow (iteration three)', () => {
  let pokeApiClient;
  let pokemonsRepository;
  let economyRepository;

  const build = (random, stock) => {
    economyRepository = createFakeBallLedger(stock);
    return createPokemonsService({
      pokeApiClient,
      pokemonsRepository,
      economyRepository,
      random,
    });
  };

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokemonsRepository = createPokemonsRepositoryMock();
    pokeApiClient.getPokemonDetail.mockImplementation(async (idOrName) => (
      idOrName === '150' || idOrName === 'mewtwo' ? legendaryDetail : detail
    ));
    pokemonsRepository.upsertFromDetail.mockResolvedValue(local);
  });

  it('consumes a ball and creates the entry when the throw lands', async () => {
    const service = build(ALWAYS_CATCHES);

    const result = await service.syncById(USER_A, 1);

    expect(result).toEqual({
      caught: true, ballType: 'poke', remainingBalls: 9, chance: 0.4, entry: local,
    });
    expect(economyRepository.consumed).toEqual(['poke']);
    expect(pokemonsRepository.upsertFromDetail).toHaveBeenCalledTimes(1);
  });

  it('consumes a ball and creates NO entry when the pokemon escapes', async () => {
    const service = build(ALWAYS_ESCAPES);

    const result = await service.syncById(USER_A, 1);

    expect(result).toEqual({
      caught: false, ballType: 'poke', remainingBalls: 9, chance: 0.4, entry: null,
    });
    expect(economyRepository.consumed).toEqual(['poke']);
    expect(economyRepository.stock.get('poke')).toBe(9);
    expect(pokemonsRepository.upsertFromDetail).not.toHaveBeenCalled();
  });

  it('spends a ball per attempt until the stock runs out, then 409s', async () => {
    const service = build(ALWAYS_ESCAPES, { poke: 2 });

    expect((await service.syncById(USER_A, 1)).remainingBalls).toBe(1);
    expect((await service.syncById(USER_A, 1)).remainingBalls).toBe(0);

    await expect(service.syncById(USER_A, 1)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.syncById(USER_A, 1)).rejects.toThrow('No Poké Ball left');
    expect(economyRepository.consumed).toHaveLength(2);
  });

  it('names the missing ball type in the 409', async () => {
    const service = build(ALWAYS_CATCHES, { poke: 1 });

    await expect(service.syncById(USER_A, 1, 'great')).rejects.toThrow('No Great Ball left');
    await expect(service.syncById(USER_A, 1, 'ultra')).rejects.toThrow('No Ultra Ball left');
    await expect(service.syncByName(USER_A, 'bulbasaur', 'master')).rejects.toThrow('No Master Ball left');
    expect(economyRepository.consumed).toEqual([]);
  });

  it('defaults an omitted, null or blank ballType to the starter Poké Ball', async () => {
    const service = build(ALWAYS_CATCHES);

    expect((await service.syncById(USER_A, 1)).ballType).toBe('poke');
    expect((await service.syncById(USER_A, 1, null)).ballType).toBe('poke');
    expect((await service.syncById(USER_A, 1, '')).ballType).toBe('poke');
    expect((await service.syncByName(USER_A, 'bulbasaur', undefined)).ballType).toBe('poke');
    expect(economyRepository.consumed).toEqual(['poke', 'poke', 'poke', 'poke']);
  });

  it('throws the ball the caller picked, and only that one', async () => {
    const service = build(ALWAYS_CATCHES, { poke: 5, ultra: 2 });

    const result = await service.syncById(USER_A, 1, 'ultra');

    expect(result.ballType).toBe('ultra');
    expect(result.chance).toBe(0.8);
    expect(result.remainingBalls).toBe(1);
    expect(economyRepository.stock.get('poke')).toBe(5);
    expect(economyRepository.consumed).toEqual(['ultra']);
  });

  it('rejects an unknown ball type with 400 before any lookup or spend', async () => {
    const service = build(ALWAYS_CATCHES);

    await expect(service.syncById(USER_A, 1, 'luxury')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.syncByName(USER_A, 'bulbasaur', 'POKE')).rejects.toThrow("'POKE' is not a valid ball type");

    expect(pokeApiClient.getPokemonDetail).not.toHaveBeenCalled();
    expect(economyRepository.consumed).toEqual([]);
  });

  it('applies the pokemon rarity to the reported chance', async () => {
    const service = build(ALWAYS_CATCHES, { poke: 5, great: 5, master: 5 });

    expect((await service.syncById(USER_A, 150)).chance).toBe(0.14);
    expect((await service.syncById(USER_A, 150, 'great')).chance).toBe(0.21);
    expect((await service.syncByName(USER_A, 'mewtwo', 'master')).chance).toBe(1);
  });

  it('never lets a Master Ball fail, whatever the roll', async () => {
    const service = build(() => 0.9999999, { master: 1 });

    const result = await service.syncById(USER_A, 150, 'master');

    expect(result.caught).toBe(true);
    expect(result.chance).toBe(1);
    expect(result.entry).toBe(local);
  });

  it('escapes a legendary with a Poké Ball on a roll just above the chance', async () => {
    const service = build(() => 0.15);

    const result = await service.syncById(USER_A, 150);

    expect(result.chance).toBe(0.14);
    expect(result.caught).toBe(false);
    expect(result.entry).toBeNull();
    // The ball is gone either way.
    expect(economyRepository.stock.get('poke')).toBe(9);
  });

  it('costs nothing when the pokemon does not exist', async () => {
    pokeApiClient.getPokemonDetail.mockReset();
    pokeApiClient.getPokemonDetail.mockResolvedValue(null);
    const service = build(ALWAYS_CATCHES);

    await expect(service.syncById(USER_A, 9999)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.syncByName(USER_A, 'missingno')).rejects.toBeInstanceOf(NotFoundError);

    expect(economyRepository.consumed).toEqual([]);
    expect(economyRepository.stock.get('poke')).toBe(10);
  });
});
