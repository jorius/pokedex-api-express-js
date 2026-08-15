// packages
import { eq } from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { ballInventory, users, wallets } from '../database/Schema.js';
// rules
import { STARTER_BALL_QUANTITY, STARTER_BALL_TYPE, STARTER_CREDITS } from '../../domain/rules/EconomyRules.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';

/**
 * Drizzle adapter for the users table — no business rules here beyond one
 * composition detail: a registration also provisions the new account's starting
 * kit (wallet + starter balls) IN THE SAME TRANSACTION as the user row, so an
 * account can never exist without a wallet and is immediately playable. The
 * amounts themselves are game rules and come from the rules module; the
 * migration's backfill hands pre-existing accounts the identical kit.
 *
 * @type {import('../../application/ports/UsersRepositoryPort.js').UsersRepositoryPort}
 */
const usersRepository = {
  create: async (email, passwordHash) => {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx.insert(users).values({ email, passwordHash }).returning();
        await tx.insert(wallets).values({ userId: row.id, credits: STARTER_CREDITS });
        await tx.insert(ballInventory).values({
          userId: row.id, ballType: STARTER_BALL_TYPE, quantity: STARTER_BALL_QUANTITY,
        });
        return row;
      });
    } catch (error) {
      // 23505 = unique_violation: closes the TOCTOU window between AuthService's
      // findByEmail check and this insert, so a race still surfaces as 409, not 500.
      // drizzle-orm >= 0.44 wraps pg errors in DrizzleQueryError with the original
      // pg DatabaseError attached as `cause` — check both levels for `code`.
      const code = error.code ?? error.cause?.code;
      if (code === '23505') throw new ConflictError('Email is already registered');
      throw error;
    }
  },
  findByEmail: async (email) => {
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ?? null;
  },
  findById: async (id) => {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },
};

export { usersRepository };
