// packages
import {
  and, asc, count, eq, inArray,
} from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { collectionEntries, pokemonAbilities, pokemons } from '../database/Schema.js';

/**
 * Drizzle adapter for the pokemons + pokemon_abilities + collection_entries
 * tables. pokemons/pokemon_abilities form the shared PokeAPI replica cache;
 * collection_entries carries per-user ownership and proprietary fields, and is
 * the only table filtered by userId.
 */

/**
 * @param {typeof collectionEntries.$inferSelect} entry
 * @param {typeof pokemons.$inferSelect} pokemon
 * @param {{ name: string, slot: number, isHidden: boolean }[]} abilities
 * @returns {import('../../domain/types/Pokemon.types.js').LocalPokemon}
 */
const toLocal = (entry, pokemon, abilities) => ({
  id: entry.id,
  pokeApiId: pokemon.pokeApiId,
  name: pokemon.name,
  spriteUrl: pokemon.spriteUrl,
  category: pokemon.category,
  weight: pokemon.weight,
  // The entry's description is a per-user override of the shared flavor text.
  description: entry.description ?? pokemon.description,
  localizedName: entry.localizedName,
  region: entry.region,
  classificationTag: entry.classificationTag,
  abilities: abilities.map((ability) => ({
    name: ability.name,
    slot: ability.slot,
    isHidden: ability.isHidden,
  })),
  capturedAt: entry.capturedAt.toISOString(),
  createdAt: entry.createdAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString(),
});

/**
 * @param {string[]} pokemonIds
 * @returns {Promise<Map<string, (typeof pokemonAbilities.$inferSelect)[]>>}
 */
const abilitiesFor = async (pokemonIds) => {
  if (pokemonIds.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(pokemonAbilities).where(inArray(pokemonAbilities.pokemonId, pokemonIds));

  const grouped = new Map();
  rows.forEach((row) => {
    const bucket = grouped.get(row.pokemonId) ?? [];
    bucket.push(row);
    grouped.set(row.pokemonId, bucket);
  });

  return grouped;
};

/**
 * @type {import('../../application/ports/PokemonsRepositoryPort.js').PokemonsRepositoryPort}
 */
const pokemonsRepository = {
  upsertFromDetail: async (userId, detail) => db.transaction(async (tx) => {
    const [row] = await tx.insert(pokemons)
      .values({
        pokeApiId: detail.pokeApiId,
        name: detail.name,
        spriteUrl: detail.spriteUrl,
        category: detail.category,
        weight: detail.weight,
        description: detail.description,
      })
      .onConflictDoUpdate({
        target: pokemons.pokeApiId,
        set: {
          name: detail.name,
          spriteUrl: detail.spriteUrl,
          category: detail.category,
          weight: detail.weight,
          description: detail.description,
          updatedAt: new Date(),
        },
      })
      .returning();

    await tx.delete(pokemonAbilities).where(eq(pokemonAbilities.pokemonId, row.id));

    if (detail.abilities.length > 0) {
      await tx.insert(pokemonAbilities).values(detail.abilities.map((ability) => ({
        pokemonId: row.id,
        name: ability.name,
        slot: ability.slot,
        isHidden: ability.isHidden,
      })));
    }

    // Idempotent capture: re-syncing refreshes the entry's updatedAt and
    // returns the existing row (proprietary fields untouched), never duplicates.
    const [entry] = await tx.insert(collectionEntries)
      .values({ userId, pokemonId: row.id })
      .onConflictDoUpdate({
        target: [collectionEntries.userId, collectionEntries.pokemonId],
        set: { updatedAt: new Date() },
      })
      .returning();

    return toLocal(entry, row, detail.abilities);
  }),

  findPage: async (userId, page, pageSize) => {
    const offset = (page - 1) * pageSize;

    const rows = await db.select({ entry: collectionEntries, pokemon: pokemons })
      .from(collectionEntries)
      .innerJoin(pokemons, eq(collectionEntries.pokemonId, pokemons.id))
      .where(eq(collectionEntries.userId, userId))
      .orderBy(asc(pokemons.pokeApiId))
      .limit(pageSize)
      .offset(offset);
    const [total] = await db.select({ value: count() })
      .from(collectionEntries)
      .where(eq(collectionEntries.userId, userId));

    const abilitiesByPokemonId = await abilitiesFor(rows.map((row) => row.pokemon.id));
    const items = rows.map((row) => toLocal(row.entry, row.pokemon, abilitiesByPokemonId.get(row.pokemon.id) ?? []));

    return {
      items,
      page,
      pageSize,
      totalCount: Number(total?.value ?? 0),
    };
  },

  findByPokeApiId: async (userId, pokeApiId) => {
    const [row] = await db.select({ entry: collectionEntries, pokemon: pokemons })
      .from(collectionEntries)
      .innerJoin(pokemons, eq(collectionEntries.pokemonId, pokemons.id))
      .where(and(eq(collectionEntries.userId, userId), eq(pokemons.pokeApiId, pokeApiId)))
      .limit(1);

    if (!row) {
      return null;
    }

    const abilities = (await abilitiesFor([row.pokemon.id])).get(row.pokemon.id) ?? [];
    return toLocal(row.entry, row.pokemon, abilities);
  },

  update: async (userId, id, payload) => {
    const [entry] = await db.update(collectionEntries)
      .set({ ...payload, updatedAt: new Date() })
      .where(and(eq(collectionEntries.id, id), eq(collectionEntries.userId, userId)))
      .returning();

    if (!entry) {
      return null;
    }

    const [pokemon] = await db.select().from(pokemons).where(eq(pokemons.id, entry.pokemonId));
    const abilities = (await abilitiesFor([entry.pokemonId])).get(entry.pokemonId) ?? [];
    return toLocal(entry, pokemon, abilities);
  },

  delete: async (userId, id) => {
    const rows = await db.delete(collectionEntries)
      .where(and(eq(collectionEntries.id, id), eq(collectionEntries.userId, userId)))
      .returning({ id: collectionEntries.id });
    return rows.length > 0;
  },
};

export { pokemonsRepository };
