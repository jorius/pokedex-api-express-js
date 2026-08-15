/**
 * @typedef {import('../../domain/types/User.types.js').RefreshTokenRecord} RefreshTokenRecord
 *
 * @typedef {object} CreateRefreshToken
 * @property {string} userId
 * @property {string} tokenHash
 * @property {string} familyId
 * @property {Date} expiresAt
 *
 * @typedef {object} RefreshTokensRepositoryPort
 * @property {(record: CreateRefreshToken) => Promise<RefreshTokenRecord>} create
 * @property {(tokenHash: string) => Promise<RefreshTokenRecord|null>} findByTokenHash
 * @property {(id: string, replacedById?: string) => Promise<void>} revoke
 * @property {(familyId: string) => Promise<void>} revokeFamily
 */

export {};
