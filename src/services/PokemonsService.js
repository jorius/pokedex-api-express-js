// utils
import { NotImplementedError } from '../utils/errors/NotImplementedError.js';

/**
 * Business logic for the four Pokemon user stories. Controllers stay thin and
 * delegate here; this layer orchestrates clients/PokeApiClient and models/PokemonsModel.
 * Lookup by id and lookup by name are separate operations (RESTful: one route
 * per identifier type); the internal PokeAPI gateway accepts either.
 */

const browse = async (_page, _pageSize) => {
  // TODO US-01: paginated enumeration (sprite, category, mass, skills) via PokeApiClient.
  throw new NotImplementedError('PokemonsService.browse');
};

const getDetailById = async (_id) => {
  // TODO US-02: image, core stats, description, evolution chain — by PokeAPI numeric id.
  throw new NotImplementedError('PokemonsService.getDetailById');
};

const getDetailByName = async (_name) => {
  // TODO US-02: image, core stats, description, evolution chain — by name.
  throw new NotImplementedError('PokemonsService.getDetailByName');
};

const syncById = async (_id) => {
  // TODO US-03: fetch from PokeAPI by id and upsert into PostgreSQL via PokemonsModel.
  throw new NotImplementedError('PokemonsService.syncById');
};

const syncByName = async (_name) => {
  // TODO US-03: fetch from PokeAPI by name and upsert into PostgreSQL via PokemonsModel.
  throw new NotImplementedError('PokemonsService.syncByName');
};

const getLocal = async (_page, _pageSize) => {
  // TODO: paginate over locally replicated records.
  throw new NotImplementedError('PokemonsService.getLocal');
};

const update = async (_id, _payload) => {
  // TODO US-04: validate payload (400), NotFoundError when missing (404), persist.
  throw new NotImplementedError('PokemonsService.update');
};

const remove = async (_id) => {
  // TODO: NotFoundError when missing, delete otherwise.
  throw new NotImplementedError('PokemonsService.remove');
};

export {
  browse, getDetailById, getDetailByName, syncById, syncByName, getLocal, update, remove,
};
