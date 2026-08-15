/**
 * @typedef {object} User
 * @property {string} id
 * @property {string} email
 * @property {string} passwordHash
 * @property {Date} createdAt
 * @property {Date} updatedAt
 *
 * @typedef {object} PublicUser
 * @property {string} id
 * @property {string} email
 *
 * @typedef {object} RefreshTokenRecord
 * @property {string} id
 * @property {string} userId
 * @property {string} tokenHash
 * @property {string} familyId
 * @property {Date} expiresAt
 * @property {Date} createdAt
 * @property {Date|null} revokedAt
 * @property {string|null} replacedById
 *
 * @typedef {object} AuthSession
 * @property {PublicUser} user
 * @property {string} accessToken
 * @property {string} refreshToken
 */

export {};
