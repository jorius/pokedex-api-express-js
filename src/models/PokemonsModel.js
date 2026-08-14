// utils
import { NotImplementedError } from '../utils/errors/NotImplementedError.js';

/**
 * Data access for locally replicated Pokemon (User Stories 03 & 04).
 * All SQL lives here, executed against config/Database.js's pool —
 * services never touch the pool directly.
 */

const findById = async (_id) => {
  // TODO: SELECT with abilities join.
  throw new NotImplementedError('PokemonsModel.findById');
};

const findByPokeApiId = async (_pokeApiId) => {
  // TODO
  throw new NotImplementedError('PokemonsModel.findByPokeApiId');
};

const findAll = async (_page, _pageSize) => {
  // TODO: paginated SELECT ordered by poke_api_id.
  throw new NotImplementedError('PokemonsModel.findAll');
};

const insert = async (_pokemon) => {
  // TODO: INSERT pokemon + abilities in a transaction (pool.connect + BEGIN/COMMIT).
  throw new NotImplementedError('PokemonsModel.insert');
};

const update = async (_id, _fields) => {
  // TODO: UPDATE proprietary fields (localized_name, region, classification_tag, description).
  throw new NotImplementedError('PokemonsModel.update');
};

const remove = async (_id) => {
  // TODO: DELETE with cascade to abilities.
  throw new NotImplementedError('PokemonsModel.remove');
};

export {
  findById, findByPokeApiId, findAll, insert, update, remove,
};
