// packages
import {
  and, count, desc, eq, exists, gt, gte, isNull, lt, lte, notExists, or, sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

// database
import { db } from '../database/Database.js';
import { ballInventory, spinResults, wallets } from '../database/Schema.js';
// rules
import { BALL_TYPES, isSpinOutcome, needsSafetyNet } from '../../domain/rules/EconomyRules.js';

/**
 * Drizzle adapter for wallets + ball_inventory + spin_results.
 *
 * ATOMICITY (the whole point of this file): credits and balls are never read
 * and then written back. Every debit is a single conditional UPDATE carrying
 * its own guard —
 *     UPDATE wallets SET credits = credits - $cost WHERE user_id = $1 AND credits >= $cost
 * — and the affected row count is the verdict. Under READ COMMITTED, a
 * concurrent updater blocks on the row lock and then RE-EVALUATES the WHERE
 * clause against the winner's committed row, so two simultaneous purchases can
 * never both pass a balance they cannot jointly afford. The CHECK constraints
 * on wallets.credits and ball_inventory.quantity are the database-level
 * backstop behind that. Multi-statement flows (debit + grant, debit + audit)
 * run inside one transaction so a failure after the debit rolls the debit back.
 *
 * The `executor` parameters below are either `db` or the transaction handle
 * drizzle hands to a db.transaction callback — both expose the same query API.
 *
 * @typedef {import('../../domain/types/Economy.types.js').BallType} BallType
 * @typedef {import('../../domain/types/Economy.types.js').SpinRecord} SpinRecord
 * @typedef {import('../../domain/types/Economy.types.js').Wallet} Wallet
 * @typedef {import('../../application/ports/EconomyRepositoryPort.js').SafetyNetGrant} SafetyNetGrant
 * @typedef {import('../../application/ports/EconomyRepositoryPort.js').WalletSnapshot} WalletSnapshot
 */

/**
 * Wallets always report ALL FOUR ball types in catalogue order, filling in 0
 * for types the caller has never owned. Clients get a fixed-shape array they
 * can render without merging against the catalogue, and the response is
 * byte-identical across the three services regardless of insertion order.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @returns {Promise<WalletSnapshot|null>}
 */
const readSnapshot = async (executor, userId) => {
  const [wallet] = await executor.select({ credits: wallets.credits, lastDailyClaimAt: wallets.lastDailyClaimAt })
    .from(wallets)
    .where(eq(wallets.userId, userId))
    .limit(1);

  if (!wallet) {
    return null;
  }

  const owned = await executor.select({ ballType: ballInventory.ballType, quantity: ballInventory.quantity })
    .from(ballInventory)
    .where(eq(ballInventory.userId, userId));
  const quantities = new Map(owned.map((row) => [row.ballType, row.quantity]));

  return {
    credits: wallet.credits,
    balls: BALL_TYPES.map((type) => ({ type, quantity: quantities.get(type) ?? 0 })),
    lastDailyClaimAt: wallet.lastDailyClaimAt,
  };
};

/**
 * The two-field wallet every mutating endpoint echoes back. It deliberately
 * projects `lastDailyClaimAt` AWAY: only GET /api/economy/wallet reports the
 * daily state, so buying, spinning, claiming and releasing all keep answering
 * the exact shape they answered before iteration four.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @returns {Promise<Wallet|null>}
 */
const readWallet = async (executor, userId) => {
  const snapshot = await readSnapshot(executor, userId);
  if (!snapshot) {
    return null;
  }
  return { credits: snapshot.credits, balls: snapshot.balls };
};

/**
 * @param {typeof spinResults.$inferSelect} row
 * @returns {SpinRecord}
 */
const toSpinRecord = (row) => ({
  id: row.id,
  reels: row.reels.split(',').map(Number),
  cost: row.cost,
  payout: row.payout,
  // Persisted as free text; anything unrecognized (hand-edited row, future
  // outcome from a newer service) degrades to 'none' rather than leaking an
  // off-contract value into the API.
  outcome: isSpinOutcome(row.outcome) ? row.outcome : 'none',
  createdAt: row.createdAt.toISOString(),
});

/**
 * Guarded debit. Returns false when the wallet could not cover the amount.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @param {number} cost
 * @param {number} payout
 * @returns {Promise<boolean>}
 */
const debit = async (executor, userId, cost, payout) => {
  const debited = await executor.update(wallets)
    .set({ credits: sql`${wallets.credits} - ${cost} + ${payout}`, updatedAt: new Date() })
    .where(and(eq(wallets.userId, userId), gte(wallets.credits, cost)))
    .returning({ credits: wallets.credits });
  return debited.length > 0;
};

/**
 * The mirror of debit() for the iteration-four earnings (catch rewards, release
 * refunds). A credit needs no balance guard — a balance can only grow — so the
 * identity of the wallet IS the guard, and the affected row count answers "does
 * this account have a wallet at all". Exported so PokemonsRepository can pay
 * inside ITS transactions: every UPDATE of wallets.credits lives in this file.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
const creditWallet = async (executor, userId, amount) => {
  const credited = await executor.update(wallets)
    .set({ credits: sql`${wallets.credits} + ${amount}`, updatedAt: new Date() })
    .where(eq(wallets.userId, userId))
    .returning({ credits: wallets.credits });
  return credited.length > 0;
};

/**
 * The anti-softlock grant, as ONE guarded statement. The caller has already
 * evaluated needsSafetyNet against a snapshot from this transaction; the
 * `setWhere` below re-asserts BOTH halves of that predicate against whatever a
 * conflicting writer committed, so two simultaneous wallet reads can never both
 * top the same trainer up:
 *   - the row that already exists must still hold zero of this ball type,
 *   - no OTHER ball type may hold anything,
 *   - the balance must still be under the threshold.
 * The plain INSERT path (no inventory row yet) needs no guard: the unique index
 * on (user_id, ball_type) forces any racing writer onto the guarded branch.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @param {SafetyNetGrant} grant
 * @returns {Promise<boolean>}
 */
const grantSafetyNet = async (executor, userId, grant) => {
  const held = alias(ballInventory, 'held');
  const granted = await executor.insert(ballInventory)
    .values({ userId, ballType: grant.ballType, quantity: grant.quantity })
    .onConflictDoUpdate({
      target: [ballInventory.userId, ballInventory.ballType],
      set: { quantity: sql`${ballInventory.quantity} + ${grant.quantity}`, updatedAt: new Date() },
      setWhere: and(
        eq(ballInventory.quantity, 0),
        exists(db.select({ ok: sql`1` }).from(wallets)
          .where(and(eq(wallets.userId, userId), lt(wallets.credits, grant.creditsThreshold)))),
        notExists(db.select({ ok: sql`1` }).from(held)
          .where(and(eq(held.userId, userId), gt(held.quantity, 0)))),
      ),
    })
    .returning({ quantity: ballInventory.quantity });
  return granted.length > 0;
};

/** @type {import('../../application/ports/EconomyRepositoryPort.js').EconomyRepositoryPort} */
const economyRepository = {
  // Wrapped in a transaction so credits and inventory come from one consistent
  // snapshot — a purchase landing between the two selects can never produce a
  // wallet that shows the new balls but the old balance. Since iteration four
  // the safety net is evaluated in that same transaction, so a granted read
  // always reports the balls it just handed out.
  getWallet: async (userId, safetyNet) => db.transaction(async (tx) => {
    const wallet = await readSnapshot(tx, userId);
    if (!wallet) {
      return null;
    }
    if (!needsSafetyNet(wallet.credits, wallet.balls) || !await grantSafetyNet(tx, userId, safetyNet)) {
      return { wallet, safetyNetGranted: false };
    }
    // Re-read rather than patch the snapshot in memory: the grant is an UPDATE
    // and the row it produced is the only truthful source for the new quantity.
    return { wallet: await readSnapshot(tx, userId) ?? wallet, safetyNetGranted: true };
  }),

  // Race-safe by construction: the cooldown lives in the WHERE clause, so a
  // second claim arriving during the window matches zero rows and is refused
  // even if both requests read the same wallet a microsecond apart. NULL means
  // never claimed, which the guard treats as claimable.
  claimDaily: async ({
    userId, amount, claimedAt, cutoff,
  }) => db.transaction(async (tx) => {
    const [claimed] = await tx.update(wallets)
      .set({ credits: sql`${wallets.credits} + ${amount}`, lastDailyClaimAt: claimedAt, updatedAt: claimedAt })
      .where(and(
        eq(wallets.userId, userId),
        or(isNull(wallets.lastDailyClaimAt), lte(wallets.lastDailyClaimAt, cutoff)),
      ))
      .returning({ claimedAt: wallets.lastDailyClaimAt });

    if (!claimed?.claimedAt) {
      return null;
    }

    const wallet = await readWallet(tx, userId);
    return wallet ? { wallet, claimedAt: claimed.claimedAt } : null;
  }),

  purchase: async ({
    userId, ballType, quantity, cost,
  }) => db.transaction(async (tx) => {
    if (!await debit(tx, userId, cost, 0)) {
      return null;
    }

    await tx.insert(ballInventory)
      .values({ userId, ballType, quantity })
      .onConflictDoUpdate({
        target: [ballInventory.userId, ballInventory.ballType],
        set: { quantity: sql`${ballInventory.quantity} + ${quantity}`, updatedAt: new Date() },
      });

    return readWallet(tx, userId);
  }),

  // One statement, so no transaction is needed: the guard, the decrement and
  // the read of what is left all happen atomically inside this UPDATE.
  consumeBall: async (userId, ballType) => {
    const [row] = await db.update(ballInventory)
      .set({ quantity: sql`${ballInventory.quantity} - 1`, updatedAt: new Date() })
      .where(and(
        eq(ballInventory.userId, userId),
        eq(ballInventory.ballType, ballType),
        gte(ballInventory.quantity, 1),
      ))
      .returning({ quantity: ballInventory.quantity });

    return row?.quantity ?? null;
  },

  applySpin: async ({
    userId, cost, reels, payout, outcome,
  }) => db.transaction(async (tx) => {
    // Cost and payout settle in the SAME arithmetic expression: the balance
    // never transiently dips below what a jackpot would immediately restore,
    // and the guard still only lets the spin through if the cost is affordable.
    if (!await debit(tx, userId, cost, payout)) {
      return null;
    }

    await tx.insert(spinResults).values({
      userId, reels: reels.join(','), cost, payout, outcome,
    });

    return readWallet(tx, userId);
  }),

  findSpinPage: async (userId, page, pageSize) => {
    const offset = (page - 1) * pageSize;

    const rows = await db.select().from(spinResults)
      .where(eq(spinResults.userId, userId))
      // id breaks ties so two spins sharing a timestamp still page deterministically.
      .orderBy(desc(spinResults.createdAt), desc(spinResults.id))
      .limit(pageSize)
      .offset(offset);
    const [total] = await db.select({ value: count() })
      .from(spinResults)
      .where(eq(spinResults.userId, userId));

    return {
      items: rows.map(toSpinRecord),
      page,
      pageSize,
      totalCount: Number(total?.value ?? 0),
    };
  },
};

export { economyRepository, readWallet, creditWallet };
