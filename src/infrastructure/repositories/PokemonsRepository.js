// packages
import {
  asc, count, eq, inArray,
} from 'drizzle-orm';

// database
import { db } from '../database/Database.js';
import { pokemonAbilities, pokemons } from '../database/Schema.js';

/** Drizzle adapter for the pokemons + pokemon_abilities tables. */

/**
 * @param {typeof pokemons.$inferSelect} row
 * @param {{ name: string, slot: number, isHidden: boolean }[]} abilities
 * @returns {import('../../domain/types/Pokemon.types.js').LocalPokemon}
 */
const toLocal = (row, abilities) => ({
  id: row.id,
  pokeApiId: row.pokeApiId,
  name: row.name,
  spriteUrl: row.spriteUrl,
  category: row.category,
  weight: row.weight,
  description: row.description,
  localizedName: row.localizedName,
  region: row.region,
  classificationTag: row.classificationTag,
  abilities: abilities.map((ability) => ({
    name: ability.name,
    slot: ability.slot,
    isHidden: ability.isHidden,
  })),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
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
  upsertFromDetail: async (detail) => db.transaction(async (tx) => {
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

    return toLocal(row, detail.abilities);
  }),

  findPage: async (page, pageSize) => {
    const offset = (page - 1) * pageSize;

    const rows = await db.select().from(pokemons)
      .orderBy(asc(pokemons.pokeApiId))
      .limit(pageSize)
      .offset(offset);
    const [total] = await db.select({ value: count() }).from(pokemons);

    const abilitiesByPokemonId = await abilitiesFor(rows.map((row) => row.id));
    const items = rows.map((row) => toLocal(row, abilitiesByPokemonId.get(row.id) ?? []));

    return {
      items,
      page,
      pageSize,
      totalCount: Number(total?.value ?? 0),
    };
  },

  update: async (id, payload) => {
    const [row] = await db.update(pokemons)
      .set({ ...payload, updatedAt: new Date() })
      .where(eq(pokemons.id, id))
      .returning();

    if (!row) {
      return null;
    }

    const abilities = (await abilitiesFor([row.id])).get(row.id) ?? [];
    return toLocal(row, abilities);
  },

  delete: async (id) => {
    const rows = await db.delete(pokemons).where(eq(pokemons.id, id)).returning({ id: pokemons.id });
    return rows.length > 0;
  },
};

export { pokemonsRepository };
