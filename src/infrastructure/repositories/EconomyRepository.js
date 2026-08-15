// packages
import {
  and, count, desc, eq, gte, sql,
} from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { ballInventory, spinResults, wallets } from '../database/Schema.js';
// rules
import { BALL_TYPES, isSpinOutcome } from '../../domain/rules/EconomyRules.js';

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
 */

/**
 * Wallets always report ALL FOUR ball types in catalogue order, filling in 0
 * for types the caller has never owned. Clients get a fixed-shape array they
 * can render without merging against the catalogue, and the response is
 * byte-identical across the three services regardless of insertion order.
 *
 * @param {typeof db} executor
 * @param {string} userId
 * @returns {Promise<Wallet|null>}
 */
const readWallet = async (executor, userId) => {
  const [wallet] = await executor.select({ credits: wallets.credits })
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
  };
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

/** @type {import('../../application/ports/EconomyRepositoryPort.js').EconomyRepositoryPort} */
const economyRepository = {
  // Wrapped in a transaction so credits and inventory come from one consistent
  // snapshot — a purchase landing between the two selects can never produce a
  // wallet that shows the new balls but the old balance.
  getWallet: async (userId) => db.transaction(async (tx) => readWallet(tx, userId)),

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

export { economyRepository };
