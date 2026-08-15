/**
 * Application-facing contract for the PokeAPI gateway. Implemented by
 * infrastructure/clients/PokeApiClient.js.
 *
 * @typedef {object} PokeApiPort
 * @property {(page: number, pageSize: number) => Promise<import('../../domain/types/Api.types.js').PagedItems>} getPokemonPage
 * @property {(idOrName: string) => Promise<import('../../domain/types/Pokemon.types.js').PokemonDetail|null>} getPokemonDetail
 */

export {};
