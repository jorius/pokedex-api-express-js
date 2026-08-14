// utils
import { NotImplementedError } from '../utils/errors/NotImplementedError.js';

/**
 * Business logic for the four Pokemon user stories. Controllers stay thin and
 * delegate here; this layer orchestrates clients/PokeApiClient and models/PokemonsModel.
 */

const browse = async (_page, _pageSize) => {
  // TODO US-01: paginated enumeration (sprite, category, mass, skills) via PokeApiClient.
  throw new NotImplementedError('PokemonsService.browse');
};

const getDetail = async (_idOrName) => {
  // TODO US-02: image, core stats, description, evolution chain.
  throw new NotImplementedError('PokemonsService.getDetail');
};

const sync = async (_idOrName) => {
  // TODO US-03: fetch from PokeAPI and upsert into PostgreSQL via PokemonsModel.
  throw new NotImplementedError('PokemonsService.sync');
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
  browse, getDetail, sync, getLocal, update, remove,
};
