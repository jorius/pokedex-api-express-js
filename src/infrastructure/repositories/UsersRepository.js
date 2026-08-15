// packages
import { eq } from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { users } from '../database/Schema.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';

/**
 * Drizzle adapter for the users table — no business rules here.
 *
 * @type {import('../../application/ports/UsersRepositoryPort.js').UsersRepositoryPort}
 */
const usersRepository = {
  create: async (email, passwordHash) => {
    try {
      const [row] = await db.insert(users).values({ email, passwordHash }).returning();
      return row;
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
