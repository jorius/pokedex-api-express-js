// packages
import {
  beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// services
import { createPokemonsService } from '../../application/services/PokemonsService.js';
// rules
import { BALL_TYPES, catchReward, releaseRefund } from '../../domain/rules/EconomyRules.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/** Rolls that force a deterministic outcome: 0 always catches, ~1 always escapes. */
const ALWAYS_CATCHES = () => 0;
const ALWAYS_ESCAPES = () => 0.9999999;

/** Scripts a sequence of throws — one roll per attempt, in order. */
const scriptedCatch = (...catches) => {
  let index = 0;
  return () => {
    const lands = catches[index % catches.length];
    index += 1;
    return lands ? 0 : 0.9999999;
  };
};

const detail = {
  pokeApiId: 1,
  name: 'bulbasaur',
  spriteUrl: 'art.png',
  shinySpriteUrl: 'shiny-art.png',
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
  shinySpriteUrl: 'squirtle-shiny.png',
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
  // No shiny artwork at either resolution — the null case travels through catch + collection.
  spriteUrl: 'mewtwo.png',
  shinySpriteUrl: null,
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
  shinySpriteUrl: 'shiny-art.png',
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
  commitCatch: jest.fn(),
  findPage: jest.fn(),
  findByPokeApiId: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  release: jest.fn(),
});

/** The commit a landed catch produces: the entry plus what the same transaction paid for it. */
const commitOf = (entry, creditsAwarded) => ({ entry, creditsAwarded });

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
    claimDaily: async () => null,
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
 *
 * It also mirrors the adapter's iteration-four money moves: a catch and a
 * release settle their credits from the SAME rules functions the adapter uses,
 * against the wallet balances exposed on `credits`, so a test can check the
 * arithmetic end to end.
 */
const createInMemoryRepository = (startingCredits = 0) => {
  const shared = new Map();
  const entries = [];
  const credits = new Map();
  let sequence = 0;

  /** Mirrors creditWallet(): a credit lands whenever the account has a wallet at all. */
  const pay = (userId, amount) => {
    credits.set(userId, (credits.get(userId) ?? startingCredits) + amount);
    return amount;
  };

  const walletOf = (userId) => ({
    credits: credits.get(userId) ?? startingCredits,
    // The collection adapter does not model inventory; balls come back untouched.
    balls: BALL_TYPES.map((type) => ({ type, quantity: 0 })),
  });

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
      shinySpriteUrl: pokemon.shinySpriteUrl,
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
    credits,

    commitCatch: async (userId, incoming) => {
      // Sorted by slot, mirroring the Drizzle adapter's deterministic ordering fix.
      const sortedAbilities = [...incoming.abilities].sort((a, b) => a.slot - b.slot);
      const normalized = { ...incoming, abilities: sortedAbilities };
      shared.set(normalized.pokeApiId, normalized);
      const existing = entries.find((entry) => entry.userId === userId && entry.pokeApiId === normalized.pokeApiId);
      if (existing) {
        existing.updatedAt = new Date();
        return { entry: toLocal(existing), creditsAwarded: pay(userId, catchReward(normalized.pokeApiId, false)) };
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
      return { entry: toLocal(created), creditsAwarded: pay(userId, catchReward(normalized.pokeApiId, true)) };
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

    // Same shape as the adapter: the delete is the guard, and only a delete that
    // actually removed the caller's row pays a refund.
    release: async (userId, id) => {
      const index = entries.findIndex((entry) => entry.userId === userId && entry.id === id);
      if (index === -1) return null;
      const [removed] = entries.splice(index, 1);
      return { creditsAwarded: pay(userId, releaseRefund(removed.pokeApiId)), wallet: walletOf(userId) };
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
    pokemonsRepository.commitCatch.mockResolvedValueOnce(commitOf(local, 100));

    const result = await service.syncById(USER_A, 1);

    expect(pokemonsRepository.commitCatch).toHaveBeenCalledWith(USER_A, detail);
    expect(result.caught).toBe(true);
    expect(result.entry).toBe(local);
    expect(result.creditsAwarded).toBe(100);
  });

  it('syncByName does not upsert when the PokeAPI lookup misses, and costs no ball', async () => {
    pokeApiClient.getPokemonDetail.mockResolvedValueOnce(null);

    await expect(service.syncByName(USER_A, 'missingno')).rejects.toBeInstanceOf(NotFoundError);
    expect(pokemonsRepository.commitCatch).not.toHaveBeenCalled();
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

  it('release validates the id, 404s on miss and never falls back to the refund-less delete', async () => {
    await expect(service.release(USER_A, 'not-a-uuid')).rejects.toBeInstanceOf(ValidationError);
    expect(pokemonsRepository.release).not.toHaveBeenCalled();

    pokemonsRepository.release.mockResolvedValueOnce(null);
    await expect(service.release(USER_A, local.id)).rejects.toThrow(`Local pokemon with key '${local.id}' was not found`);

    pokemonsRepository.release.mockResolvedValueOnce({ creditsAwarded: 150, wallet: { credits: 1150, balls: [] } });
    const result = await service.release(USER_A, local.id);

    expect(pokemonsRepository.release).toHaveBeenCalledWith(USER_A, local.id);
    expect(pokemonsRepository.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ creditsAwarded: 150, wallet: { credits: 1150, balls: [] } });
    expect(Object.keys(result)).toEqual(['creditsAwarded', 'wallet']);
  });
});

describe('PokemonsService with in-memory repository (ownership semantics)', () => {
  let pokeApiClient;
  let pokemonsRepository;
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
    pokeApiClient.getPokemonDetail.mockImplementation(async (idOrName) => {
      if (idOrName === '7') return shuffledAbilitiesDetail;
      if (idOrName === '150' || idOrName === 'mewtwo') return legendaryDetail;
      return detail;
    });
    pokemonsRepository = createInMemoryRepository(1000);
    service = createPokemonsService({
      pokeApiClient,
      pokemonsRepository,
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

  it('pays 100 for a species new to the collection and 25 for every re-catch', async () => {
    const first = await service.syncById(USER_A, 1);
    const second = await service.syncById(USER_A, 1);
    const third = await service.syncById(USER_A, 1);

    expect(first.creditsAwarded).toBe(100);
    expect(second.creditsAwarded).toBe(25);
    expect(third.creditsAwarded).toBe(25);
    expect(pokemonsRepository.credits.get(USER_A)).toBe(1000 + 100 + 25 + 25);
  });

  it('pays 600 for a new legendary and 525 for re-catching one', async () => {
    expect((await service.syncById(USER_A, 150)).creditsAwarded).toBe(600);
    expect((await service.syncByName(USER_A, 'mewtwo')).creditsAwarded).toBe(525);
    expect(pokemonsRepository.credits.get(USER_A)).toBe(1000 + 600 + 525);
  });

  it('pays each trainer for their OWN first catch of a shared species', async () => {
    expect((await service.syncById(USER_A, 1)).creditsAwarded).toBe(100);
    expect((await service.syncById(USER_B, 1)).creditsAwarded).toBe(100);
    expect(pokemonsRepository.credits.get(USER_A)).toBe(1100);
    expect(pokemonsRepository.credits.get(USER_B)).toBe(1100);
  });

  it('refunds a release and removes the entry from the collection', async () => {
    const entry = await capture(USER_A, 1);

    const released = await service.release(USER_A, entry.id);

    expect(released.creditsAwarded).toBe(150);
    expect(released.wallet.credits).toBe(1000 + 100 + 150);
    expect((await service.getLocal(USER_A, 1, 20)).totalCount).toBe(0);
    await expect(service.getLocalByPokeApiId(USER_A, 1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refunds 600 for a legendary', async () => {
    const entry = await capture(USER_A, 150);

    expect((await service.release(USER_A, entry.id)).creditsAwarded).toBe(600);
    expect(pokemonsRepository.credits.get(USER_A)).toBe(1000 + 600 + 600);
  });

  it('releases only the caller entry: another trainer 404s and keeps their own', async () => {
    const entryA = await capture(USER_A, 1);
    const entryB = await capture(USER_B, 1);

    await expect(service.release(USER_B, entryA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.release(USER_B, entryA.id)).rejects.toThrow(`Local pokemon with key '${entryA.id}' was not found`);

    // B paid nothing for the failed attempt, and both collections are intact.
    expect(pokemonsRepository.credits.get(USER_B)).toBe(1100);
    expect((await service.getLocal(USER_A, 1, 20)).items[0].id).toBe(entryA.id);
    expect((await service.getLocal(USER_B, 1, 20)).items[0].id).toBe(entryB.id);
  });

  it('refuses to pay twice for the same entry', async () => {
    const entry = await capture(USER_A, 1);

    await service.release(USER_A, entry.id);
    await expect(service.release(USER_A, entry.id)).rejects.toBeInstanceOf(NotFoundError);

    expect(pokemonsRepository.credits.get(USER_A)).toBe(1000 + 100 + 150);
  });

  it('can be re-caught after a release, and pays the new-species reward again', async () => {
    const entry = await capture(USER_A, 1);
    await service.release(USER_A, entry.id);

    const recaught = await service.syncById(USER_A, 1);

    expect(recaught.creditsAwarded).toBe(100);
    expect(recaught.entry?.id).not.toBe(entry.id);
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
    pokemonsRepository.commitCatch.mockResolvedValue(commitOf(local, 100));
  });

  it('consumes a ball and creates the entry when the throw lands', async () => {
    const service = build(ALWAYS_CATCHES);

    const result = await service.syncById(USER_A, 1);

    expect(result).toEqual({
      caught: true, ballType: 'poke', remainingBalls: 9, chance: 0.4, creditsAwarded: 100, entry: local,
    });
    expect(economyRepository.consumed).toEqual(['poke']);
    expect(pokemonsRepository.commitCatch).toHaveBeenCalledTimes(1);
  });

  // The three backends serialize this payload key by key: creditsAwarded was
  // APPENDED after chance, and nothing before it may move.
  it('keeps the catch key order: caught, ballType, remainingBalls, chance, creditsAwarded, entry', async () => {
    const service = build(ALWAYS_CATCHES);

    expect(Object.keys(await service.syncById(USER_A, 1))).toEqual([
      'caught', 'ballType', 'remainingBalls', 'chance', 'creditsAwarded', 'entry',
    ]);
  });

  it('consumes a ball and creates NO entry when the pokemon escapes', async () => {
    const service = build(ALWAYS_ESCAPES);

    const result = await service.syncById(USER_A, 1);

    expect(result).toEqual({
      caught: false, ballType: 'poke', remainingBalls: 9, chance: 0.4, creditsAwarded: 0, entry: null,
    });
    expect(economyRepository.consumed).toEqual(['poke']);
    expect(economyRepository.stock.get('poke')).toBe(9);
    expect(pokemonsRepository.commitCatch).not.toHaveBeenCalled();
  });

  it('pays for a landed catch exactly once, and never for an escape', async () => {
    const service = build(scriptedCatch(true, false, true));

    const first = await service.syncById(USER_A, 1);
    const escaped = await service.syncById(USER_A, 1);
    const third = await service.syncById(USER_A, 1);

    expect([first.caught, escaped.caught, third.caught]).toEqual([true, false, true]);
    expect([first.creditsAwarded, escaped.creditsAwarded, third.creditsAwarded]).toEqual([100, 0, 100]);
    // Three balls thrown, two entries committed: the escape settled nothing at all.
    expect(economyRepository.consumed).toHaveLength(3);
    expect(pokemonsRepository.commitCatch).toHaveBeenCalledTimes(2);
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
