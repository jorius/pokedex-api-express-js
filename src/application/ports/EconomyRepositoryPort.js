/**
 * Persistence contract for the pokeball economy. Every method that moves
 * credits or balls is ATOMIC by construction: the adapter guards each mutation
 * with a conditional UPDATE (`WHERE credits >= cost` / `WHERE quantity >= 1`)
 * and reports failure by returning null instead of throwing, so the service
 * layer never has to read-then-write. `null` therefore means "the guard
 * rejected it" — insufficient credits, or no ball of that type left.
 *
 * @typedef {import('../../domain/types/Api.types.js').PagedItems} PagedItems
 * @typedef {import('../../domain/types/Economy.types.js').BallType} BallType
 * @typedef {import('../../domain/types/Economy.types.js').SpinOutcome} SpinOutcome
 * @typedef {import('../../domain/types/Economy.types.js').SpinRecord} SpinRecord
 * @typedef {import('../../domain/types/Economy.types.js').Wallet} Wallet
 *
 * @typedef {object} PurchaseRequest
 * @property {string} userId
 * @property {BallType} ballType
 * @property {number} quantity
 * @property {number} cost Total price for the whole quantity, computed by the rules module.
 *
 * @typedef {object} SpinCommit
 * @property {string} userId
 * @property {number} cost
 * @property {number[]} reels
 * @property {number} payout
 * @property {SpinOutcome} outcome
 */

/**
 * The safety net the caller authorizes for a wallet read (iteration four): the
 * balance under which a trainer counts as broke, and the ball grant to hand out
 * when they are broke AND holding nothing. The adapter applies it atomically or
 * not at all — it never reports a grant it did not write.
 *
 * @typedef {object} SafetyNetGrant
 * @property {number} creditsThreshold
 * @property {BallType} ballType
 * @property {number} quantity
 */

/**
 * A wallet plus the raw daily-claim marker the service turns into dailyAvailable/nextDailyAt.
 *
 * @typedef {object} WalletSnapshot
 * @property {number} credits
 * @property {import('../../domain/types/Economy.types.js').BallHolding[]} balls
 * @property {Date|null} lastDailyClaimAt
 */

/**
 * What a wallet read answers: the snapshot AFTER any safety-net grant, and
 * whether this read granted it.
 *
 * @typedef {object} WalletRead
 * @property {WalletSnapshot} wallet
 * @property {boolean} safetyNetGranted
 */

/**
 * A daily-bonus claim. The service owns the clock (so tests can travel through
 * the cooldown without sleeping) and hands down both instants: `claimedAt` is
 * written to the wallet, `cutoff` is the guard — a claim only lands when the
 * stored marker is null or at or before the cutoff.
 *
 * @typedef {object} DailyClaimRequest
 * @property {string} userId
 * @property {number} amount
 * @property {Date} claimedAt
 * @property {Date} cutoff
 */

/**
 * A settled claim: the updated wallet and the instant the adapter recorded.
 *
 * @typedef {object} DailyClaimCommit
 * @property {Wallet} wallet
 * @property {Date} claimedAt
 */

/**
 * `getWallet` reads the wallet and applies the safety net in ONE transaction, so
 * the returned balls already include a grant this read triggered; it resolves
 * null when the caller has no wallet row at all (an account that predates the
 * economy). `claimDaily` resolves null when the cooldown guard rejected the claim
 * (or the caller has no wallet); `purchase` resolves null when the wallet could
 * not cover `cost`; `consumeBall` resolves the remaining quantity after consuming
 * one ball, or null when there was none to consume; `applySpin` applies cost +
 * payout and persists the spin, resolving null when the wallet could not cover
 * `cost`.
 *
 * @typedef {object} EconomyRepositoryPort
 * @property {(userId: string, safetyNet: SafetyNetGrant) => Promise<WalletRead|null>} getWallet
 * @property {(request: DailyClaimRequest) => Promise<DailyClaimCommit|null>} claimDaily
 * @property {(request: PurchaseRequest) => Promise<Wallet|null>} purchase
 * @property {(userId: string, ballType: BallType) => Promise<number|null>} consumeBall
 * @property {(commit: SpinCommit) => Promise<Wallet|null>} applySpin
 * @property {(userId: string, page: number, pageSize: number) => Promise<PagedItems>} findSpinPage
 */

export {};
