// packages
import {
  and, eq, isNull,
} from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { refreshTokens } from '../database/Schema.js';

/**
 * Drizzle adapter for the refresh_tokens table — rotation logic lives in AuthService.
 *
 * @type {import('../../application/ports/RefreshTokensRepositoryPort.js').RefreshTokensRepositoryPort}
 */
const refreshTokensRepository = {
  create: async (record) => {
    const [row] = await db.insert(refreshTokens).values(record).returning();
    return row;
  },
  findByTokenHash: async (tokenHash) => {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    return row ?? null;
  },
  revoke: async (id, replacedById) => {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date(), replacedById: replacedById ?? null })
      .where(eq(refreshTokens.id, id));
  },
  revokeFamily: async (familyId) => {
    await db.update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  },
};

export { refreshTokensRepository };
