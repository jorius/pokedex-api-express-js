/**
 * @typedef {import('../../domain/types/Pokemon.types.js').PokemonDetail} PokemonDetail
 * @typedef {import('../../domain/types/Pokemon.types.js').LocalPokemon} LocalPokemon
 * @typedef {import('../../domain/types/Pokemon.types.js').UpdatePokemonPayload} UpdatePokemonPayload
 * @typedef {import('../../domain/types/Api.types.js').PagedItems} PagedItems
 *
 * All local-collection operations are user-scoped: the shared pokemons
 * replica is upserted globally, but reads/updates/deletes only ever touch the
 * caller's collection_entries rows. `id` parameters are collection entry ids.
 *
 * @typedef {object} PokemonsRepositoryPort
 * @property {(userId: string, detail: PokemonDetail) => Promise<LocalPokemon>} upsertFromDetail
 * @property {(userId: string, page: number, pageSize: number) => Promise<PagedItems>} findPage
 * @property {(userId: string, pokeApiId: number) => Promise<LocalPokemon|null>} findByPokeApiId
 * @property {(userId: string, id: string, payload: UpdatePokemonPayload) => Promise<LocalPokemon|null>} update
 * @property {(userId: string, id: string) => Promise<boolean>} delete
 */

export {};
