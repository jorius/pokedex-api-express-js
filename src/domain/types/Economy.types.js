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
 * The wallet as every mutating endpoint (shop, slots, daily, release) echoes it back.
 *
 * @typedef {object} Wallet
 * @property {number} credits
 * @property {BallHolding[]} balls
 */

/**
 * What GET /api/economy/wallet returns: the wallet plus the daily-bonus state
 * and the safety-net verdict for THIS read (iteration four). Key order is part
 * of the cross-service contract — existing keys first, then the new ones:
 * credits, balls, dailyAvailable, nextDailyAt, safetyNetGranted.
 *
 * `nextDailyAt` is null exactly when `dailyAvailable` is true: there is nothing
 * to count down to while the button is enabled.
 *
 * @typedef {object} WalletStatus
 * @property {number} credits
 * @property {BallHolding[]} balls
 * @property {boolean} dailyAvailable
 * @property {string|null} nextDailyAt
 * @property {boolean} safetyNetGranted
 */

/**
 * POST /api/economy/daily response: the updated wallet plus when the bonus
 * unlocks again. Key order: credits, balls, nextClaimAt.
 *
 * @typedef {object} DailyClaim
 * @property {number} credits
 * @property {BallHolding[]} balls
 * @property {string} nextClaimAt
 */

/**
 * POST /api/pokemons/local/{entryId}/release response. Key order:
 * creditsAwarded, wallet.
 *
 * @typedef {object} ReleaseResult
 * @property {number} creditsAwarded
 * @property {Wallet} wallet
 */

/**
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
 * Key order is part of the cross-service contract. `creditsAwarded` (iteration
 * four) was APPENDED after `chance` and before `entry` — 0 on an escape, and
 * the catch reward paid in the same transaction as the entry on a success.
 *
 * @typedef {object} CatchResult
 * @property {boolean} caught
 * @property {BallType} ballType
 * @property {number} remainingBalls
 * @property {number} chance
 * @property {number} creditsAwarded
 * @property {import('./Pokemon.types.js').LocalPokemon|null} entry
 */

export {};
