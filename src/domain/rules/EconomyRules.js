// packages
import crypto from 'node:crypto';

/**
 * SINGLE SOURCE OF TRUTH for the pokeball economy's game rules (plan §2).
 * Everything here is a pure function over explicit inputs plus an injectable
 * `random`, so the fairness of the game is fully unit-testable and every roll
 * is reproducible in a test. The three pokedex backends mirror these constants
 * and formulas EXACTLY — changing a number here is a cross-service contract
 * change, not a local tweak.
 *
 * Every roll happens server-side. Nothing in this module reads client input
 * beyond the ball type and the pokemon being thrown at.
 *
 * @typedef {import('../types/Economy.types.js').BallType} BallType
 * @typedef {import('../types/Economy.types.js').BallCatalogueItem} BallCatalogueItem
 * @typedef {import('../types/Economy.types.js').SpinEvaluation} SpinEvaluation
 * @typedef {import('../types/Economy.types.js').SpinRoll} SpinRoll
 * @typedef {import('../types/Pokemon.types.js').PokemonStat} PokemonStat
 *
 * A source of uniform randomness in [0, 1).
 *
 * @typedef {() => number} RandomSource
 */

/* ------------------------------------------------------------------ */
/* Starting kit                                                        */
/* ------------------------------------------------------------------ */

/** Credits granted at registration, and by the migration backfill to pre-existing accounts. */
const STARTER_CREDITS = 10000;
const STARTER_BALL_TYPE = 'poke';
const STARTER_BALL_QUANTITY = 10;

/* ------------------------------------------------------------------ */
/* Ball catalogue                                                      */
/* ------------------------------------------------------------------ */

const BALL_TYPES = ['poke', 'great', 'ultra', 'master'];

/** Used when a catch request omits `ballType` — the starter ball. */
const DEFAULT_BALL_TYPE = 'poke';

/**
 * Ordered cheapest-first — the shop renders this array as-is, so the order is
 * part of the contract.
 */
const BALL_CATALOGUE = [
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
];

/* ------------------------------------------------------------------ */
/* Rarity                                                              */
/* ------------------------------------------------------------------ */

/**
 * The canonical Legendary + Mythical species ids, generations I–IX, grouped by
 * generation. Ultra Beasts (793–799, 803–806) are deliberately EXCLUDED: they
 * are their own in-game classification, not Legendary/Mythical, and treating
 * them as legendary would make an entire mid-game bracket near-uncatchable.
 *
 * This list is hard-coded on purpose (plan §2): rarity must not depend on an
 * extra PokeAPI round-trip, and all three backends must agree on it byte for
 * byte.
 */
const LEGENDARY_POKE_API_IDS = [
  // Gen I — the legendary birds, Mewtwo and Mew
  144, 145, 146, 150, 151,
  // Gen II — the legendary beasts, the tower duo and Celebi
  243, 244, 245, 249, 250, 251,
  // Gen III — the golems, the eon duo, the weather trio, Jirachi and Deoxys
  377, 378, 379, 380, 381, 382, 383, 384, 385, 386,
  // Gen IV — the lake guardians, the creation trio and the Sinnoh mythicals
  480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
  // Gen V — Victini, the swords of justice, the forces of nature, the tao trio and friends
  494, 638, 639, 640, 641, 642, 643, 644, 645, 646, 647, 648, 649,
  // Gen VI — Xerneas, Yveltal, Zygarde and the Kalos mythicals
  716, 717, 718, 719, 720, 721,
  // Gen VII — Type: Null/Silvally, the tapus, the Cosmog line, Necrozma and the Alola mythicals
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 801, 802, 807, 808, 809,
  // Gen VIII — the heroes of many battles, Eternatus, the Kubfu line, the Galar legendaries
  888, 889, 890, 891, 892, 893, 894, 895, 896, 897, 898,
  // Gen IX — the treasures of ruin, the box legendaries, the paradox legendaries and Pecharunt
  1001, 1002, 1003, 1004, 1007, 1008, 1009, 1010, 1014, 1015, 1016, 1017, 1020, 1021, 1022, 1023, 1024, 1025,
];

const LEGENDARY_ID_SET = new Set(LEGENDARY_POKE_API_IDS);

/** Rarity multipliers applied to a ball's base catch rate (plan §2). */
const RARITY_LEGENDARY = 0.35;
const RARITY_PSEUDO_LEGENDARY = 0.5;
const RARITY_STRONG = 0.75;
const RARITY_COMMON = 1;

/** Base-stat-total thresholds separating the non-legendary rarity tiers. */
const PSEUDO_LEGENDARY_BST = 600;
const STRONG_BST = 500;

/** A catch is never hopeless and never a certainty — except with a Master Ball. */
const MIN_CATCH_CHANCE = 0.05;
const MAX_CATCH_CHANCE = 1;

/**
 * Chances are rounded to 4 decimals before leaving this module. Without it the
 * three services would report subtly different floats for the same throw (e.g.
 * 0.4 × 0.75 evaluates to 0.30000000000000004 in IEEE-754 double arithmetic),
 * which would break byte-for-byte response parity.
 */
const CHANCE_DECIMALS = 4;

/* ------------------------------------------------------------------ */
/* Slots                                                               */
/* ------------------------------------------------------------------ */

const SLOT_COST = 100;
const SLOT_REEL_COUNT = 3;

/**
 * The reel pool. Weighting is expressed by REPETITION rather than a weight
 * table so that "pick a uniformly random element" stays the whole algorithm and
 * ports to any language without a weighted-sampling helper.
 *
 * 9 common species appear twice each (18/21 slots) and 3 legendaries appear
 * once each (3/21), so a single reel lands on a legendary 1 time in 7.
 * Resulting probabilities per spin: jackpot (3/21)³ ≈ 0.29%, non-jackpot triple
 * ≈ 0.78%, exactly-two-matching ≈ 23.9% — about a 70% return to player at 100
 * credits a spin.
 */
const SLOT_REEL_POOL = [
  1, 1, 4, 4, 7, 7, 25, 25, 39, 39, 52, 52, 54, 54, 133, 133, 143, 143, 150, 151, 249,
];

/** Payout table, richest first — the evaluation below checks it in this order. */
const SLOT_JACKPOT_PAYOUT = 5000;
const SLOT_TRIPLE_PAYOUT = 1000;
const SLOT_PAIR_PAYOUT = 200;
const SLOT_NO_PAYOUT = 0;

/* ------------------------------------------------------------------ */
/* Randomness                                                          */
/* ------------------------------------------------------------------ */

const RANDOM_RESOLUTION = 2 ** 32;

/**
 * Default source of randomness: a cryptographically secure uniform value in
 * [0, 1). Math.random is not used — the odds are real money in credits, and a
 * predictable PRNG would let a determined client anticipate rolls. Every
 * consumer takes this as an injectable parameter so tests can pin the roll.
 *
 * @returns {number}
 */
const secureRandom = () => crypto.randomInt(0, RANDOM_RESOLUTION) / RANDOM_RESOLUTION;

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {*} value
 * @returns {boolean} true when the value is one of the four catalogue ball types
 */
const isBallType = (value) => typeof value === 'string' && BALL_TYPES.includes(value);

/**
 * @param {number} pokeApiId
 * @returns {boolean}
 */
const isLegendary = (pokeApiId) => LEGENDARY_ID_SET.has(pokeApiId);

/**
 * Throws only for a type the caller failed to validate — callers validate with isBallType first.
 *
 * @param {BallType} ballType
 * @returns {BallCatalogueItem}
 */
const findBall = (ballType) => {
  const found = BALL_CATALOGUE.find((ball) => ball.type === ballType);
  if (!found) throw new Error(`Unknown ball type '${ballType}'`);
  return found;
};

/**
 * @param {BallType} ballType
 * @returns {string}
 */
const ballName = (ballType) => findBall(ballType).name;

/**
 * @param {BallType} ballType
 * @returns {number}
 */
const ballPrice = (ballType) => findBall(ballType).price;

/**
 * Base stat total, or null when the source has no stats to sum — a null BST is
 * "unknown rarity", which scales by 1.0 rather than guessing.
 *
 * @param {PokemonStat[]} stats
 * @returns {number|null}
 */
const baseStatTotal = (stats) => {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  return stats.reduce((total, stat) => total + stat.value, 0);
};

/**
 * Rarity multiplier for a pokemon (plan §2). Legendaries and mythicals are the
 * hardest catch regardless of their stat line; everything else is tiered by
 * base stat total.
 *
 * @param {number} pokeApiId
 * @param {number|null} bst
 * @returns {number}
 */
const rarityMultiplier = (pokeApiId, bst) => {
  if (isLegendary(pokeApiId)) return RARITY_LEGENDARY;
  if (bst === null) return RARITY_COMMON;
  if (bst >= PSEUDO_LEGENDARY_BST) return RARITY_PSEUDO_LEGENDARY;
  if (bst >= STRONG_BST) return RARITY_STRONG;
  return RARITY_COMMON;
};

/**
 * @param {number} value
 * @returns {number}
 */
const roundChance = (value) => {
  const factor = 10 ** CHANCE_DECIMALS;
  return Math.round(value * factor) / factor;
};

/**
 * A catch is never hopeless and never certain. With today's constants the floor
 * is inactive — the worst throw in the game is a Poké Ball at a legendary,
 * 0.40 × 0.35 = 0.14 — so this exists to keep any future rebalance of the
 * catalogue or the multipliers inside the documented band.
 *
 * @param {number} value
 * @returns {number}
 */
const clampChance = (value) => Math.min(Math.max(value, MIN_CATCH_CHANCE), MAX_CATCH_CHANCE);

/**
 * Final catch chance = clamp(base rate × rarity multiplier, 0.05, 1.0).
 * The Master Ball ignores rarity entirely and always reads 1.0 — it is the
 * guaranteed catch the player paid 5000 credits for.
 *
 * @param {BallType} ballType
 * @param {number} pokeApiId
 * @param {number|null} bst
 * @returns {number}
 */
const catchChance = (ballType, pokeApiId, bst) => {
  const ball = findBall(ballType);
  if (ball.catchRate >= MAX_CATCH_CHANCE) return MAX_CATCH_CHANCE;
  return roundChance(clampChance(ball.catchRate * rarityMultiplier(pokeApiId, bst)));
};

/**
 * The throw itself. `random() < chance` means a chance of 1.0 always catches
 * (random() never reaches 1) and a chance of 0 never would.
 *
 * @param {number} chance
 * @param {RandomSource} [random]
 * @returns {boolean}
 */
const rollCatch = (chance, random = secureRandom) => random() < chance;

/**
 * @param {RandomSource} [random]
 * @returns {number[]}
 */
const spinReels = (random = secureRandom) => Array.from(
  { length: SLOT_REEL_COUNT },
  () => SLOT_REEL_POOL[Math.floor(random() * SLOT_REEL_POOL.length)],
);

/**
 * Payout table (plan §2), evaluated richest-first:
 *   three legendaries (matching or not) → jackpot 5000
 *   any three matching                  → triple  1000
 *   exactly two matching                → pair     200
 *   otherwise                           → none       0
 * With three reels, "exactly two matching" is precisely two distinct symbols.
 *
 * @param {number[]} reels
 * @returns {SpinEvaluation}
 */
const evaluateSpin = (reels) => {
  if (reels.length === SLOT_REEL_COUNT && reels.every(isLegendary)) {
    return { outcome: 'jackpot', payout: SLOT_JACKPOT_PAYOUT };
  }
  const distinct = new Set(reels).size;
  if (distinct === 1) return { outcome: 'triple', payout: SLOT_TRIPLE_PAYOUT };
  if (distinct === 2) return { outcome: 'pair', payout: SLOT_PAIR_PAYOUT };
  return { outcome: 'none', payout: SLOT_NO_PAYOUT };
};

/**
 * @param {RandomSource} [random]
 * @returns {SpinRoll}
 */
const rollSpin = (random = secureRandom) => {
  const reels = spinReels(random);
  return { reels, ...evaluateSpin(reels) };
};

/**
 * @param {string} value
 * @returns {boolean}
 */
const isSpinOutcome = (value) => ['jackpot', 'triple', 'pair', 'none'].includes(value);

export {
  STARTER_CREDITS,
  STARTER_BALL_TYPE,
  STARTER_BALL_QUANTITY,
  BALL_TYPES,
  DEFAULT_BALL_TYPE,
  BALL_CATALOGUE,
  LEGENDARY_POKE_API_IDS,
  RARITY_LEGENDARY,
  RARITY_PSEUDO_LEGENDARY,
  RARITY_STRONG,
  RARITY_COMMON,
  PSEUDO_LEGENDARY_BST,
  STRONG_BST,
  MIN_CATCH_CHANCE,
  MAX_CATCH_CHANCE,
  SLOT_COST,
  SLOT_REEL_COUNT,
  SLOT_REEL_POOL,
  SLOT_JACKPOT_PAYOUT,
  SLOT_TRIPLE_PAYOUT,
  SLOT_PAIR_PAYOUT,
  SLOT_NO_PAYOUT,
  secureRandom,
  isBallType,
  isLegendary,
  isSpinOutcome,
  findBall,
  ballName,
  ballPrice,
  baseStatTotal,
  rarityMultiplier,
  clampChance,
  catchChance,
  rollCatch,
  spinReels,
  evaluateSpin,
  rollSpin,
};
