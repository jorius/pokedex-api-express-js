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
 * `getWallet` resolves null when the caller has no wallet row at all (an account
 * that predates the economy); `purchase` resolves null when the wallet could not
 * cover `cost`; `consumeBall` resolves the remaining quantity after consuming one
 * ball, or null when there was none to consume; `applySpin` applies cost + payout
 * and persists the spin, resolving null when the wallet could not cover `cost`.
 *
 * @typedef {object} EconomyRepositoryPort
 * @property {(userId: string) => Promise<Wallet|null>} getWallet
 * @property {(request: PurchaseRequest) => Promise<Wallet|null>} purchase
 * @property {(userId: string, ballType: BallType) => Promise<number|null>} consumeBall
 * @property {(commit: SpinCommit) => Promise<Wallet|null>} applySpin
 * @property {(userId: string, page: number, pageSize: number) => Promise<PagedItems>} findSpinPage
 */

export {};
