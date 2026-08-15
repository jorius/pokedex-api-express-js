// packages
import { describe, expect, it } from '@jest/globals';

// rules
import {
  BALL_CATALOGUE,
  BALL_TYPES,
  DEFAULT_BALL_TYPE,
  LEGENDARY_POKE_API_IDS,
  MAX_CATCH_CHANCE,
  MIN_CATCH_CHANCE,
  PSEUDO_LEGENDARY_BST,
  RARITY_COMMON,
  RARITY_LEGENDARY,
  RARITY_PSEUDO_LEGENDARY,
  RARITY_STRONG,
  SLOT_COST,
  SLOT_JACKPOT_PAYOUT,
  SLOT_PAIR_PAYOUT,
  SLOT_REEL_COUNT,
  SLOT_REEL_POOL,
  SLOT_TRIPLE_PAYOUT,
  STARTER_BALL_QUANTITY,
  STARTER_BALL_TYPE,
  STARTER_CREDITS,
  STRONG_BST,
  ballName,
  ballPrice,
  baseStatTotal,
  catchChance,
  clampChance,
  evaluateSpin,
  findBall,
  isBallType,
  isLegendary,
  isSpinOutcome,
  rarityMultiplier,
  rollCatch,
  rollSpin,
  secureRandom,
  spinReels,
} from '../../domain/rules/EconomyRules.js';

/**
 * The game's fairness lives in these constants and formulas, and the other two
 * pokedex backends mirror them exactly — so this suite pins every number, not
 * just the behaviour. A failure here is a cross-service contract break.
 */

/** Deterministic random source: replays the given values in a loop. */
const scriptedRandom = (...values) => {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
};

const MEWTWO = 150;
const BULBASAUR = 1;

describe('EconomyRules — starting kit', () => {
  it('grants 10000 credits and 10 Poké Balls', () => {
    expect(STARTER_CREDITS).toBe(10000);
    expect(STARTER_BALL_TYPE).toBe('poke');
    expect(STARTER_BALL_QUANTITY).toBe(10);
  });
});

describe('EconomyRules — ball catalogue', () => {
  it('lists exactly the four ball types, cheapest first, with the agreed prices and rates', () => {
    expect(BALL_TYPES).toEqual(['poke', 'great', 'ultra', 'master']);
    expect(BALL_CATALOGUE).toEqual([
      {
        type: 'poke', name: 'Poké Ball', price: 200, catchRate: 0.4,
      },
      {
        type: 'great', name: 'Great Ball', price: 600, catchRate: 0.6,
      },
      {
        type: 'ultra', name: 'Ultra Ball', price: 1200, catchRate: 0.8,
      },
      {
        type: 'master', name: 'Master Ball', price: 5000, catchRate: 1,
      },
    ]);
  });

  it('defaults a catch to the starter Poké Ball', () => {
    expect(DEFAULT_BALL_TYPE).toBe('poke');
  });

  it('exposes each ball by type', () => {
    expect(findBall('ultra').price).toBe(1200);
    expect(ballPrice('great')).toBe(600);
    expect(ballName('poke')).toBe('Poké Ball');
    expect(ballName('master')).toBe('Master Ball');
  });

  it('throws for a ball type the caller failed to validate', () => {
    expect(() => findBall('luxury')).toThrow("Unknown ball type 'luxury'");
  });

  it('recognizes valid ball types and rejects anything else', () => {
    BALL_TYPES.forEach((type) => expect(isBallType(type)).toBe(true));
    [undefined, null, '', 'POKE', 'luxury', 1, {}, ['poke']].forEach((value) => {
      expect(isBallType(value)).toBe(false);
    });
  });
});

describe('EconomyRules — legendary list', () => {
  it('contains the canonical box legendaries and mythicals', () => {
    [144, 150, 151, 249, 251, 384, 386, 493, 649, 721, 802, 898, 1025].forEach((id) => {
      expect(isLegendary(id)).toBe(true);
    });
  });

  it('excludes ordinary species and the pseudo-legendaries', () => {
    [1, 6, 25, 133, 143, 149, 248, 373, 445, 635].forEach((id) => {
      expect(isLegendary(id)).toBe(false);
    });
  });

  it('excludes Ultra Beasts, which are their own classification', () => {
    [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806].forEach((id) => {
      expect(isLegendary(id)).toBe(false);
    });
  });

  it('holds no duplicates and only positive integers', () => {
    expect(new Set(LEGENDARY_POKE_API_IDS).size).toBe(LEGENDARY_POKE_API_IDS.length);
    LEGENDARY_POKE_API_IDS.forEach((id) => {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThan(0);
    });
  });
});

describe('EconomyRules — base stat total', () => {
  it('sums the stat line', () => {
    expect(baseStatTotal([{ name: 'hp', value: 45 }, { name: 'attack', value: 49 }])).toBe(94);
  });

  it('reports null when there are no stats to sum', () => {
    expect(baseStatTotal([])).toBeNull();
    expect(baseStatTotal(undefined)).toBeNull();
  });
});

describe('EconomyRules — rarity multiplier', () => {
  it('applies 0.35 to legendaries and mythicals regardless of their stat line', () => {
    expect(rarityMultiplier(MEWTWO, 680)).toBe(RARITY_LEGENDARY);
    expect(rarityMultiplier(MEWTWO, 100)).toBe(RARITY_LEGENDARY);
    expect(rarityMultiplier(MEWTWO, null)).toBe(RARITY_LEGENDARY);
    expect(RARITY_LEGENDARY).toBe(0.35);
  });

  it('tiers everything else by base stat total, boundaries inclusive', () => {
    expect(rarityMultiplier(BULBASAUR, PSEUDO_LEGENDARY_BST)).toBe(RARITY_PSEUDO_LEGENDARY);
    expect(rarityMultiplier(BULBASAUR, PSEUDO_LEGENDARY_BST - 1)).toBe(RARITY_STRONG);
    expect(rarityMultiplier(BULBASAUR, STRONG_BST)).toBe(RARITY_STRONG);
    expect(rarityMultiplier(BULBASAUR, STRONG_BST - 1)).toBe(RARITY_COMMON);
    expect([RARITY_PSEUDO_LEGENDARY, RARITY_STRONG, RARITY_COMMON]).toEqual([0.5, 0.75, 1]);
    expect([PSEUDO_LEGENDARY_BST, STRONG_BST]).toEqual([600, 500]);
  });

  it('treats an unknown base stat total as common rather than guessing', () => {
    expect(rarityMultiplier(BULBASAUR, null)).toBe(RARITY_COMMON);
  });
});

describe('EconomyRules — catch chance', () => {
  it('is the ball rate for a common pokemon', () => {
    expect(catchChance('poke', BULBASAUR, 318)).toBe(0.4);
    expect(catchChance('great', BULBASAUR, 318)).toBe(0.6);
    expect(catchChance('ultra', BULBASAUR, 318)).toBe(0.8);
  });

  it('scales by rarity and rounds away IEEE-754 noise so all three services agree', () => {
    expect(catchChance('poke', BULBASAUR, 525)).toBe(0.3);
    expect(catchChance('great', MEWTWO, 680)).toBe(0.21);
    expect(catchChance('ultra', MEWTWO, 680)).toBe(0.28);
    expect(catchChance('poke', MEWTWO, 680)).toBe(0.14);
    expect(catchChance('ultra', BULBASAUR, 600)).toBe(0.4);
  });

  it('makes the Master Ball a guaranteed catch, rarity ignored', () => {
    expect(catchChance('master', MEWTWO, 680)).toBe(1);
    expect(catchChance('master', BULBASAUR, 318)).toBe(1);
    expect(catchChance('master', MEWTWO, null)).toBe(MAX_CATCH_CHANCE);
  });

  it('clamps into the documented 0.05..1.0 band', () => {
    expect(clampChance(0)).toBe(MIN_CATCH_CHANCE);
    expect(clampChance(0.001)).toBe(0.05);
    expect(clampChance(-5)).toBe(0.05);
    expect(clampChance(0.5)).toBe(0.5);
    expect(clampChance(1.5)).toBe(MAX_CATCH_CHANCE);
    expect([MIN_CATCH_CHANCE, MAX_CATCH_CHANCE]).toEqual([0.05, 1]);
  });

  it('never produces a chance outside the band for any ball × rarity combination', () => {
    const rarities = [null, 300, 499, 500, 599, 600, 720];
    BALL_TYPES.forEach((type) => {
      [BULBASAUR, MEWTWO].forEach((id) => {
        rarities.forEach((bst) => {
          const chance = catchChance(type, id, bst);
          expect(chance).toBeGreaterThanOrEqual(MIN_CATCH_CHANCE);
          expect(chance).toBeLessThanOrEqual(MAX_CATCH_CHANCE);
        });
      });
    });
  });
});

describe('EconomyRules — the throw', () => {
  it('catches when the roll lands under the chance and escapes otherwise', () => {
    expect(rollCatch(0.4, scriptedRandom(0.39))).toBe(true);
    expect(rollCatch(0.4, scriptedRandom(0.4))).toBe(false);
    expect(rollCatch(0.4, scriptedRandom(0.99))).toBe(false);
  });

  it('always catches at chance 1.0 — random() never reaches 1', () => {
    expect(rollCatch(1, scriptedRandom(0.9999999))).toBe(true);
    expect(rollCatch(1, scriptedRandom(0))).toBe(true);
  });

  it('never catches at chance 0', () => {
    expect(rollCatch(0, scriptedRandom(0))).toBe(false);
  });
});

describe('EconomyRules — slot reels', () => {
  it('costs 100 credits and spins three reels', () => {
    expect(SLOT_COST).toBe(100);
    expect(SLOT_REEL_COUNT).toBe(3);
  });

  it('weights the pool by repetition: 9 commons twice each, 3 legendaries once each', () => {
    expect(SLOT_REEL_POOL).toHaveLength(21);

    const legendaries = SLOT_REEL_POOL.filter(isLegendary);
    expect(legendaries).toEqual([150, 151, 249]);

    const commons = SLOT_REEL_POOL.filter((id) => !isLegendary(id));
    expect(commons).toHaveLength(18);
    expect(new Set(commons).size).toBe(9);
    new Set(commons).forEach((id) => {
      expect(commons.filter((entry) => entry === id)).toHaveLength(2);
    });
  });

  it('picks three ids from the pool using the injected random source', () => {
    // 0 → first pool entry, 0.999… → last pool entry.
    expect(spinReels(scriptedRandom(0, 0.99999, 0))).toEqual([SLOT_REEL_POOL[0], SLOT_REEL_POOL[20], SLOT_REEL_POOL[0]]);

    const reels = spinReels(secureRandom);
    expect(reels).toHaveLength(3);
    reels.forEach((id) => expect(SLOT_REEL_POOL).toContain(id));
  });
});

describe('EconomyRules — slot payout table', () => {
  it('pays the jackpot for three legendaries, matching or not', () => {
    expect(evaluateSpin([150, 151, 249])).toEqual({ outcome: 'jackpot', payout: SLOT_JACKPOT_PAYOUT });
    expect(evaluateSpin([150, 150, 150])).toEqual({ outcome: 'jackpot', payout: 5000 });
    expect(evaluateSpin([150, 150, 249])).toEqual({ outcome: 'jackpot', payout: 5000 });
  });

  it('pays a triple for any three matching non-legendaries', () => {
    expect(evaluateSpin([25, 25, 25])).toEqual({ outcome: 'triple', payout: SLOT_TRIPLE_PAYOUT });
    expect(SLOT_TRIPLE_PAYOUT).toBe(1000);
  });

  it('pays a pair for exactly two matching', () => {
    expect(evaluateSpin([25, 25, 4])).toEqual({ outcome: 'pair', payout: SLOT_PAIR_PAYOUT });
    expect(evaluateSpin([4, 25, 25])).toEqual({ outcome: 'pair', payout: 200 });
    expect(evaluateSpin([25, 4, 25])).toEqual({ outcome: 'pair', payout: 200 });
    // Two legendaries and a common is a pair, not a jackpot.
    expect(evaluateSpin([150, 150, 4])).toEqual({ outcome: 'pair', payout: 200 });
    expect(evaluateSpin([150, 249, 4])).toEqual({ outcome: 'none', payout: 0 });
  });

  it('pays nothing for three different non-legendaries', () => {
    expect(evaluateSpin([1, 4, 7])).toEqual({ outcome: 'none', payout: 0 });
  });

  it('rolls reels and evaluates them in one call', () => {
    expect(rollSpin(scriptedRandom(0, 0, 0))).toEqual({
      reels: [SLOT_REEL_POOL[0], SLOT_REEL_POOL[0], SLOT_REEL_POOL[0]],
      outcome: 'triple',
      payout: 1000,
    });
    // Pool indexes 18, 19, 20 are the three legendaries.
    expect(rollSpin(scriptedRandom(18 / 21, 19 / 21, 20 / 21))).toEqual({
      reels: [150, 151, 249],
      outcome: 'jackpot',
      payout: 5000,
    });
  });

  it('recognizes exactly the four persisted outcomes', () => {
    ['jackpot', 'triple', 'pair', 'none'].forEach((outcome) => expect(isSpinOutcome(outcome)).toBe(true));
    ['JACKPOT', 'win', ''].forEach((outcome) => expect(isSpinOutcome(outcome)).toBe(false));
  });
});

describe('EconomyRules — randomness', () => {
  it('produces uniform values in [0, 1)', () => {
    const samples = Array.from({ length: 500 }, () => secureRandom());
    samples.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
    // Not a distribution test — just proof it is not a constant.
    expect(new Set(samples).size).toBeGreaterThan(400);
  });
});
