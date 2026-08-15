// packages
import { desc, sql } from 'drizzle-orm';
import {
  boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

/**
 * READ-ONLY MIRROR of pokedex-api-express-ts's Schema.ts — that repo is the
 * single source of truth and the only one that generates/applies migrations
 * (drizzle-kit). Never add drizzle-kit or migration scripts here; if the
 * schema changes, port the change from the TS repo verbatim.
 */

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  familyId: uuid('family_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedById: uuid('replaced_by_id').references(() => refreshTokens.id),
}, (table) => [
  index('refresh_tokens_family_id_idx').on(table.familyId),
]);

const pokemons = pgTable('pokemons', {
  id: uuid('id').primaryKey().defaultRandom(),
  pokeApiId: integer('poke_api_id').notNull().unique(),
  name: text('name').notNull(),
  spriteUrl: text('sprite_url'),
  category: text('category'),
  weight: integer('weight'),
  description: text('description'),
  // DEPRECATED (iteration two): per-user proprietary fields moved to
  // collection_entries. These columns are kept nullable and unused to avoid a
  // destructive migration on live data — do not read or write them.
  localizedName: text('localized_name'),
  region: text('region'),
  classificationTag: text('classification_tag'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

const pokemonAbilities = pgTable('pokemon_abilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  pokemonId: uuid('pokemon_id').notNull().references(() => pokemons.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slot: integer('slot').notNull(),
  isHidden: boolean('is_hidden').notNull().default(false),
}, (table) => [
  index('pokemon_abilities_pokemon_id_idx').on(table.pokemonId),
  uniqueIndex('pokemon_abilities_pokemon_id_slot_unique').on(table.pokemonId, table.slot),
]);

/**
 * Junction table: per-user ownership of shared pokemons plus the per-user
 * proprietary fields (localizedName/region/classificationTag/description —
 * the entry's description overrides the shared flavor text when set).
 */
const collectionEntries = pgTable('collection_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pokemonId: uuid('pokemon_id').notNull().references(() => pokemons.id, { onDelete: 'cascade' }),
  localizedName: text('localized_name'),
  region: text('region'),
  classificationTag: text('classification_tag'),
  description: text('description'),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('collection_entries_user_id_pokemon_id_unique').on(table.userId, table.pokemonId),
  index('collection_entries_user_id_idx').on(table.userId),
  index('collection_entries_pokemon_id_idx').on(table.pokemonId),
]);

/**
 * Iteration three — the pokeball economy. One wallet per user (UNIQUE user_id),
 * so the credit balance has exactly one authoritative row to lock/guard.
 */
const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  credits: integer('credits').notNull().default(10000),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Last line of defence against a double-spend: even if application-level guards were
  // bypassed, the database refuses to let a balance go negative.
  check('wallets_credits_non_negative', sql`${table.credits} >= 0`),
]);

/** One row per (user, ball type). Quantity can never go negative (CHECK). */
const ballInventory = pgTable('ball_inventory', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ballType: text('ball_type').notNull(),
  quantity: integer('quantity').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('ball_inventory_user_id_ball_type_unique').on(table.userId, table.ballType),
  index('ball_inventory_user_id_idx').on(table.userId),
  check('ball_inventory_quantity_non_negative', sql`${table.quantity} >= 0`),
]);

/** Append-only audit trail for the slots minigame; also serves the history endpoint. */
const spinResults = pgTable('spin_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Comma-joined pokeApiIds, e.g. '25,25,6' — a text column keeps the three
  // backends free of array-type mapping differences.
  reels: text('reels').notNull(),
  cost: integer('cost').notNull(),
  payout: integer('payout').notNull(),
  outcome: text('outcome').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('spin_results_user_id_created_at_idx').on(table.userId, desc(table.createdAt)),
]);

export {
  users, refreshTokens, pokemons, pokemonAbilities, collectionEntries, wallets, ballInventory, spinResults,
};
