/**
 * @typedef {import('../../domain/types/Pokemon.types.js').PokemonDetail} PokemonDetail
 * @typedef {import('../../domain/types/Pokemon.types.js').LocalPokemon} LocalPokemon
 * @typedef {import('../../domain/types/Pokemon.types.js').UpdatePokemonPayload} UpdatePokemonPayload
 * @typedef {import('../../domain/types/Api.types.js').PagedItems} PagedItems
 *
 * @typedef {object} PokemonsRepositoryPort
 * @property {(detail: PokemonDetail) => Promise<LocalPokemon>} upsertFromDetail
 * @property {(page: number, pageSize: number) => Promise<PagedItems>} findPage
 * @property {(id: string, payload: UpdatePokemonPayload) => Promise<LocalPokemon|null>} update
 * @property {(id: string) => Promise<boolean>} delete
 */

export {};
