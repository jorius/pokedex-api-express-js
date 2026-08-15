// packages
import crypto from 'node:crypto';
import {
  beforeEach, describe, expect, it,
} from '@jest/globals';

// services
import { createEconomyService } from '../../application/services/EconomyService.js';
// rules
import { BALL_CATALOGUE, SLOT_REEL_POOL } from '../../domain/rules/EconomyRules.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BALL_TYPES = ['poke', 'great', 'ultra', 'master'];

/** Deterministic random source: replays the given values in a loop, so repeated spins repeat the script. */
const scriptedRandom = (...values) => {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
};

/**
 * In-memory economy repository with the SAME guard semantics as the Drizzle
 * adapter: a debit only happens when the balance already covers the cost, a
 * ball is only consumed when one is in stock, and a refused guard returns null
 * rather than throwing. That keeps these service tests honest about the
 * behaviour the atomic SQL provides, without a live database.
 */
const createFakeEconomyRepository = () => {
  const credits = new Map();
  const inventory = new Map();
  const spins = [];
  const key = (userId, ballType) => `${userId}:${ballType}`;

  const snapshot = (userId) => {
    const balance = credits.get(userId);
    if (balance === undefined) return null;
    return {
      credits: balance,
      balls: BALL_TYPES.map((type) => ({ type, quantity: inventory.get(key(userId, type)) ?? 0 })),
    };
  };

  return {
    credits,
    inventory,
    spins,

    seed: (userId, startingCredits, balls) => {
      credits.set(userId, startingCredits);
      Object.entries(balls).forEach(([type, quantity]) => inventory.set(key(userId, type), quantity));
    },

    getWallet: async (userId) => snapshot(userId),

    purchase: async ({
      userId, ballType, quantity, cost,
    }) => {
      const balance = credits.get(userId);
      if (balance === undefined || balance < cost) return null;
      credits.set(userId, balance - cost);
      inventory.set(key(userId, ballType), (inventory.get(key(userId, ballType)) ?? 0) + quantity);
      return snapshot(userId);
    },

    consumeBall: async (userId, ballType) => {
      const held = inventory.get(key(userId, ballType)) ?? 0;
      if (held < 1) return null;
      inventory.set(key(userId, ballType), held - 1);
      return held - 1;
    },

    applySpin: async ({
      userId, cost, reels, payout, outcome,
    }) => {
      const balance = credits.get(userId);
      if (balance === undefined || balance < cost) return null;
      credits.set(userId, balance - cost + payout);
      spins.unshift({
        id: crypto.randomUUID(), reels, cost, payout, outcome, createdAt: new Date().toISOString(),
      });
      return snapshot(userId);
    },

    findSpinPage: async (userId, page, pageSize) => {
      const offset = (page - 1) * pageSize;
      return {
        items: spins.slice(offset, offset + pageSize), page, pageSize, totalCount: spins.length,
      };
    },
  };
};

describe('EconomyService — catalogue and wallet', () => {
  let economyRepository;
  let service;

  beforeEach(() => {
    economyRepository = createFakeEconomyRepository();
    service = createEconomyService({ economyRepository });
  });

  it('serves the ball catalogue without a caller', () => {
    expect(service.getCatalogue()).toEqual(BALL_CATALOGUE);
  });

  it('hands out copies so a caller cannot mutate the shared catalogue', () => {
    const [first] = service.getCatalogue();
    first.price = 1;

    expect(service.getCatalogue()[0].price).toBe(200);
    expect(BALL_CATALOGUE[0].price).toBe(200);
  });

  it('returns the caller wallet', async () => {
    economyRepository.seed(USER_A, 10000, { poke: 10 });

    expect(await service.getWallet(USER_A)).toEqual({
      credits: 10000,
      balls: [
        { type: 'poke', quantity: 10 },
        { type: 'great', quantity: 0 },
        { type: 'ultra', quantity: 0 },
        { type: 'master', quantity: 0 },
      ],
    });
  });

  it('404s when the caller has no wallet at all', async () => {
    await expect(service.getWallet(USER_B)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.getWallet(USER_B)).rejects.toThrow(`Wallet with key '${USER_B}' was not found`);
  });
});

describe('EconomyService — shop', () => {
  let economyRepository;
  let service;

  beforeEach(() => {
    economyRepository = createFakeEconomyRepository();
    economyRepository.seed(USER_A, 10000, { poke: 10 });
    service = createEconomyService({ economyRepository });
  });

  it('debits the exact cost and credits the balls', async () => {
    const wallet = await service.buy(USER_A, 'great', 5);

    expect(wallet.credits).toBe(10000 - 600 * 5);
    expect(wallet.balls).toContainEqual({ type: 'great', quantity: 5 });
    expect(wallet.balls).toContainEqual({ type: 'poke', quantity: 10 });
  });

  it('adds to an existing stack rather than replacing it', async () => {
    await service.buy(USER_A, 'poke', 3);
    const wallet = await service.buy(USER_A, 'poke', 2);

    expect(wallet.balls).toContainEqual({ type: 'poke', quantity: 15 });
    expect(wallet.credits).toBe(10000 - 200 * 5);
  });

  it('spends down to exactly zero without tipping negative', async () => {
    economyRepository.seed(USER_B, 1000, {});
    const wallet = await service.buy(USER_B, 'poke', 5);

    expect(wallet.credits).toBe(0);
    await expect(service.buy(USER_B, 'poke', 1)).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects an unaffordable purchase with 409 Not enough credits and changes nothing', async () => {
    await expect(service.buy(USER_A, 'master', 99)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.buy(USER_A, 'master', 99)).rejects.toThrow('Not enough credits');

    expect((await service.getWallet(USER_A)).credits).toBe(10000);
    expect((await service.getWallet(USER_A)).balls).toContainEqual({ type: 'master', quantity: 0 });
  });

  it('rejects an unknown ball type before touching the wallet', async () => {
    await expect(service.buy(USER_A, 'luxury', 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.buy(USER_A, 'luxury', 1)).rejects.toThrow("'luxury' is not a valid ball type");
    await expect(service.buy(USER_A, undefined, 1)).rejects.toThrow("'undefined' is not a valid ball type");
    await expect(service.buy(USER_A, 'POKE', 1)).rejects.toBeInstanceOf(ValidationError);

    expect((await service.getWallet(USER_A)).credits).toBe(10000);
  });

  it('rejects a quantity outside 1..99', async () => {
    const message = 'quantity must be an integer between 1 and 99';
    await expect(service.buy(USER_A, 'poke', 0)).rejects.toThrow(message);
    await expect(service.buy(USER_A, 'poke', -1)).rejects.toThrow(message);
    await expect(service.buy(USER_A, 'poke', 100)).rejects.toThrow(message);
    await expect(service.buy(USER_A, 'poke', 1.5)).rejects.toThrow(message);
    await expect(service.buy(USER_A, 'poke', '5')).rejects.toThrow(message);
    await expect(service.buy(USER_A, 'poke', undefined)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.buy(USER_A, 'poke', Number.NaN)).rejects.toBeInstanceOf(ValidationError);

    expect((await service.getWallet(USER_A)).credits).toBe(10000);
  });

  it('accepts the boundary quantities', async () => {
    expect((await service.buy(USER_A, 'poke', 1)).balls).toContainEqual({ type: 'poke', quantity: 11 });

    economyRepository.seed(USER_B, 100000, {});
    expect((await service.buy(USER_B, 'poke', 99)).balls).toContainEqual({ type: 'poke', quantity: 99 });
  });
});

describe('EconomyService — slots', () => {
  let economyRepository;

  beforeEach(() => {
    economyRepository = createFakeEconomyRepository();
    economyRepository.seed(USER_A, 10000, {});
  });

  // Pool indexes 18/19/20 are the three legendaries; index 0 is the first common.
  const atPoolIndex = (index) => index / SLOT_REEL_POOL.length;

  it('debits 100 credits and persists a losing spin', async () => {
    const service = createEconomyService({
      economyRepository,
      random: scriptedRandom(atPoolIndex(0), atPoolIndex(2), atPoolIndex(4)),
    });

    const result = await service.spin(USER_A);

    expect(result.reels).toEqual([1, 4, 7]);
    expect(result.outcome).toBe('none');
    expect(result.payout).toBe(0);
    expect(result.wallet.credits).toBe(9900);
    expect(economyRepository.spins).toHaveLength(1);
    expect(economyRepository.spins[0]).toMatchObject({ cost: 100, payout: 0, outcome: 'none' });
  });

  it('pays a pair: net +100 on the wallet', async () => {
    const service = createEconomyService({
      economyRepository,
      random: scriptedRandom(atPoolIndex(0), atPoolIndex(1), atPoolIndex(4)),
    });

    const result = await service.spin(USER_A);

    expect(result.reels).toEqual([1, 1, 7]);
    expect(result.outcome).toBe('pair');
    expect(result.payout).toBe(200);
    expect(result.wallet.credits).toBe(10000 - 100 + 200);
  });

  it('pays a triple', async () => {
    const service = createEconomyService({ economyRepository, random: scriptedRandom(atPoolIndex(0)) });

    const result = await service.spin(USER_A);

    expect(result.reels).toEqual([1, 1, 1]);
    expect(result.outcome).toBe('triple');
    expect(result.payout).toBe(1000);
    expect(result.wallet.credits).toBe(10900);
  });

  it('pays the jackpot for three legendaries', async () => {
    const service = createEconomyService({
      economyRepository,
      random: scriptedRandom(atPoolIndex(18), atPoolIndex(19), atPoolIndex(20)),
    });

    const result = await service.spin(USER_A);

    expect(result.reels).toEqual([150, 151, 249]);
    expect(result.outcome).toBe('jackpot');
    expect(result.payout).toBe(5000);
    expect(result.wallet.credits).toBe(14900);
    expect(economyRepository.spins[0]).toMatchObject({ payout: 5000, outcome: 'jackpot' });
  });

  it('keeps the wallet arithmetic exact across a run of spins', async () => {
    const service = createEconomyService({ economyRepository, random: scriptedRandom(atPoolIndex(0), atPoolIndex(2), atPoolIndex(4)) });

    await service.spin(USER_A);
    await service.spin(USER_A);
    const third = await service.spin(USER_A);

    expect(third.wallet.credits).toBe(9700);
    expect(economyRepository.spins).toHaveLength(3);
  });

  it('refuses a spin the wallet cannot afford, and persists nothing', async () => {
    economyRepository.seed(USER_B, 99, {});
    const service = createEconomyService({ economyRepository });

    await expect(service.spin(USER_B)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.spin(USER_B)).rejects.toThrow('Not enough credits');

    expect(economyRepository.credits.get(USER_B)).toBe(99);
    expect(economyRepository.spins).toHaveLength(0);
  });

  it('allows the last affordable spin at exactly the cost', async () => {
    economyRepository.seed(USER_B, 100, {});
    const service = createEconomyService({ economyRepository, random: scriptedRandom(atPoolIndex(0), atPoolIndex(2), atPoolIndex(4)) });

    expect((await service.spin(USER_B)).wallet.credits).toBe(0);
    await expect(service.spin(USER_B)).rejects.toThrow('Not enough credits');
  });
});

describe('EconomyService — spin history', () => {
  let economyRepository;
  let service;

  beforeEach(() => {
    economyRepository = createFakeEconomyRepository();
    economyRepository.seed(USER_A, 10000, {});
    service = createEconomyService({ economyRepository });
  });

  it('pages the caller history, most recent first', async () => {
    await service.spin(USER_A);
    await service.spin(USER_A);

    const result = await service.getSpinHistory(USER_A, 1, 1);

    expect(result.totalCount).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toBe(economyRepository.spins[0]);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(1);
  });

  it('rejects invalid pagination with the shared messages', async () => {
    await expect(service.getSpinHistory(USER_A, 0, 20)).rejects.toThrow('page must be an integer >= 1');
    await expect(service.getSpinHistory(USER_A, 1, 0)).rejects.toThrow('pageSize must be an integer between 1 and 100');
    await expect(service.getSpinHistory(USER_A, 1, 101)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getSpinHistory(USER_A, 1.5, 20)).rejects.toBeInstanceOf(ValidationError);
  });
});
