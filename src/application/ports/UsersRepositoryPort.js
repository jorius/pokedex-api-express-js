/**
 * @typedef {import('../../domain/types/User.types.js').User} User
 *
 * @typedef {object} UsersRepositoryPort
 * @property {(email: string, passwordHash: string) => Promise<User>} create
 * @property {(email: string) => Promise<User|null>} findByEmail
 * @property {(id: string) => Promise<User|null>} findById
 */

export {};
