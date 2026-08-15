/**
 * Domain types for the pokeball economy (iteration three): wallets, ball
 * inventory, the shop catalogue and the slots minigame. Shared verbatim by all
 * three pokedex backends — field names here are the cross-service contract.
 *
 * @typedef {'poke'|'great'|'ultra'|'master'} BallType
 *
 * @typedef {'jackpot'|'triple'|'pair'|'none'} SpinOutcome
 *
 * @typedef {object} BallCatalogueItem
 * @property {BallType} type
 * @property {string} name
 * @property {number} price
 * @property {number} catchRate
 *
 * @typedef {object} BallHolding
 * @property {BallType} type
 * @property {number} quantity
 */

/**
 * What GET /api/economy/wallet returns, and what every mutating endpoint echoes back.
 *
 * @typedef {object} Wallet
 * @property {number} credits
 * @property {BallHolding[]} balls
 *
 * @typedef {object} SpinEvaluation
 * @property {SpinOutcome} outcome
 * @property {number} payout
 *
 * @typedef {object} SpinRoll
 * @property {number[]} reels
 * @property {SpinOutcome} outcome
 * @property {number} payout
 */

/**
 * POST /api/economy/slots/spin response payload.
 *
 * @typedef {object} SpinResponse
 * @property {number[]} reels
 * @property {SpinOutcome} outcome
 * @property {number} payout
 * @property {Wallet} wallet
 */

/**
 * One persisted spin_results row, as served by the history endpoint.
 *
 * @typedef {object} SpinRecord
 * @property {string} id
 * @property {number[]} reels
 * @property {number} cost
 * @property {number} payout
 * @property {SpinOutcome} outcome
 * @property {string} createdAt
 */

/**
 * Result of a catch attempt (the two sync routes). The ball is consumed whether
 * or not the roll succeeded; `entry` is the collection entry on success and
 * null when the pokemon escaped.
 *
 * @typedef {object} CatchResult
 * @property {boolean} caught
 * @property {BallType} ballType
 * @property {number} remainingBalls
 * @property {number} chance
 * @property {import('./Pokemon.types.js').LocalPokemon|null} entry
 */

export {};
