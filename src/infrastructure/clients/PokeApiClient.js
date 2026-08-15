// errors
import { NotImplementedError } from '../../domain/errors/NotImplementedError.js';

/**
 * Gateway to the external PokeAPI (https://pokeapi.co/docs/v2), using native fetch
 * against infrastructure/config/Env.js's pokeApiBaseUrl.
 * PokeAPI itself accepts either an id or a name in the same path segment, so this
 * internal gateway keeps a single detail method; the REST surface exposes separate endpoints.
 * Nice to have: cache responses (in-memory with TTL) before hitting the network.
 */

const getPokemonPage = async (_page, _pageSize) => {
  // TODO US-01: GET /pokemon?offset=&limit= and hydrate entries.
  throw new NotImplementedError('PokeApiClient.getPokemonPage');
};

const getPokemonDetail = async (_idOrName) => {
  // TODO US-02: GET /pokemon/{idOrName} + /pokemon-species + evolution chain.
  throw new NotImplementedError('PokeApiClient.getPokemonDetail');
};

export { getPokemonPage, getPokemonDetail };
