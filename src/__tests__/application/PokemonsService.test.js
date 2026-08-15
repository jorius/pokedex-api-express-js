// packages
import {
  beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// services
import { createPokemonsService } from '../../application/services/PokemonsService.js';
// utils
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
  let service;

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokemonsRepository = createPokemonsRepositoryMock();
    service = createPokemonsService({ pokeApiClient, pokemonsRepository });
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
    expect(result).toBe(local);
  });

  it('syncByName does not upsert when the PokeAPI lookup misses', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);

    await expect(service.syncByName(USER_A, 'missingno')).rejects.toBeInstanceOf(NotFoundError);
    expect(pokemonsRepository.upsertFromDetail).not.toHaveBeenCalled();
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

  beforeEach(() => {
    pokeApiClient = createPokeApiClientMock();
    pokeApiClient.getPokemonDetail.mockImplementation(
      async (idOrName) => (idOrName === '7' ? shuffledAbilitiesDetail : detail),
    );
    service = createPokemonsService({ pokeApiClient, pokemonsRepository: createInMemoryRepository() });
  });

  it('re-syncing is idempotent: same entry id, no duplicates', async () => {
    const first = await service.syncById(USER_A, 1);
    const second = await service.syncById(USER_A, 1);

    expect(second.id).toBe(first.id);
    expect(second.capturedAt).toBe(first.capturedAt);

    const mine = await service.getLocal(USER_A, 1, 20);
    expect(mine.totalCount).toBe(1);
    expect(mine.items).toHaveLength(1);
  });

  it('re-syncing preserves proprietary fields on the entry', async () => {
    const entry = await service.syncById(USER_A, 1);
    await service.update(USER_A, entry.id, { localizedName: 'Semillita' });

    const resynced = await service.syncById(USER_A, 1);

    expect(resynced.id).toBe(entry.id);
    expect(resynced.localizedName).toBe('Semillita');
  });

  it('collections are isolated per user', async () => {
    const entryA = await service.syncById(USER_A, 1);

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
    const entryA = await service.syncById(USER_A, 1);
    const entryB = await service.syncById(USER_B, 1);

    expect(entryB.id).not.toBe(entryA.id);

    await service.update(USER_A, entryA.id, { localizedName: 'Semillita' });

    const b = await service.getLocalByPokeApiId(USER_B, 1);
    expect(b.localizedName).toBeNull();
  });

  it('getLocalByPokeApiId returns the caller entry with joined base fields', async () => {
    const entry = await service.syncById(USER_A, 1);

    const found = await service.getLocalByPokeApiId(USER_A, 1);

    expect(found.id).toBe(entry.id);
    expect(found.name).toBe('bulbasaur');
    expect(found.description).toBe('A strange seed.');
    expect(found.capturedAt).toBe(entry.capturedAt);
  });

  it('the entry description overrides the shared flavor text when set', async () => {
    const entry = await service.syncById(USER_A, 1);

    const updated = await service.update(USER_A, entry.id, { description: 'My own note.' });
    expect(updated.description).toBe('My own note.');

    // The shared pokemon keeps its flavor text for other users.
    const entryB = await service.syncById(USER_B, 1);
    expect(entryB.description).toBe('A strange seed.');
  });

  it('abilities come back slot-ordered even when the source array is shuffled', async () => {
    const synced = await service.syncById(USER_A, 7);
    expect(synced.abilities.map((a) => a.slot)).toEqual([1, 2, 3]);
    expect(synced.abilities.map((a) => a.name)).toEqual(['torrent', 'shell-armor', 'rain-dish']);

    // A later read agrees with the fresh sync, not just the sync response itself.
    const found = await service.getLocalByPokeApiId(USER_A, 7);
    expect(found.abilities.map((a) => a.slot)).toEqual([1, 2, 3]);
  });
});
