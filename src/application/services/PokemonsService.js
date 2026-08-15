// utils
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * Business logic for the four Pokemon user stories. Lookup by id and by name
 * are separate operations (RESTful: one route per identifier type); the
 * internal PokeAPI gateway accepts either.
 */

const MAX_PAGE_SIZE = 100;
const MAX_FIELD_LENGTH = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = ['localizedName', 'region', 'classificationTag', 'description'];

const validatePagination = (page, pageSize) => {
  if (!Number.isInteger(page) || page < 1) throw new ValidationError('page must be an integer >= 1');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
};

const validatePokeApiId = (id) => {
  if (!Number.isInteger(id) || id < 1) throw new ValidationError('id must be an integer >= 1');
};

const validateLocalId = (id) => {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new ValidationError(`'${id}' is not a valid uuid`);
};

const validateName = (name) => {
  const normalized = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!normalized) throw new ValidationError('name is required');
  return normalized;
};

const validateUpdatePayload = (payload) => {
  const sanitized = {};
  EDITABLE_FIELDS.forEach((field) => {
    const value = payload[field];
    if (value === undefined) return;
    if (typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) {
      throw new ValidationError(`${field} must be a string of at most ${MAX_FIELD_LENGTH} characters`);
    }
    sanitized[field] = value;
  });
  if (Object.keys(sanitized).length === 0) {
    throw new ValidationError(`At least one editable field is required: ${EDITABLE_FIELDS.join(', ')}`);
  }
  return sanitized;
};

/**
 * @param {object} deps
 * @param {import('../ports/PokeApiPort.js').PokeApiPort} deps.pokeApiClient
 * @param {import('../ports/PokemonsRepositoryPort.js').PokemonsRepositoryPort} deps.pokemonsRepository
 */
const createPokemonsService = ({ pokeApiClient, pokemonsRepository }) => {
  const getDetail = async (idOrName, label) => {
    const found = await pokeApiClient.getPokemonDetail(idOrName);
    if (!found) throw new NotFoundError('Pokemon', label);
    return found;
  };

  const browse = async (page, pageSize) => {
    validatePagination(page, pageSize);
    return pokeApiClient.getPokemonPage(page, pageSize);
  };

  // async (not a plain arrow returning a Promise): validation runs synchronously, and this must
  // still surface as a REJECTED promise (not a synchronous throw) for callers awaiting the result.
  const getDetailById = async (id) => {
    validatePokeApiId(id);
    return getDetail(String(id), String(id));
  };

  const getDetailByName = async (name) => {
    const normalized = validateName(name);
    return getDetail(normalized, normalized);
  };

  const syncById = async (userId, id) => pokemonsRepository.upsertFromDetail(userId, await getDetailById(id));

  const syncByName = async (userId, name) => pokemonsRepository.upsertFromDetail(userId, await getDetailByName(name));

  const getLocal = async (userId, page, pageSize) => {
    validatePagination(page, pageSize);
    return pokemonsRepository.findPage(userId, page, pageSize);
  };

  const getLocalByPokeApiId = async (userId, pokeApiId) => {
    validatePokeApiId(pokeApiId);
    const found = await pokemonsRepository.findByPokeApiId(userId, pokeApiId);
    if (!found) throw new NotFoundError('Local pokemon', String(pokeApiId));
    return found;
  };

  const update = async (userId, id, payload) => {
    validateLocalId(id);
    const sanitized = validateUpdatePayload(payload ?? {});
    const updated = await pokemonsRepository.update(userId, id, sanitized);
    if (!updated) throw new NotFoundError('Local pokemon', id);
    return updated;
  };

  const remove = async (userId, id) => {
    validateLocalId(id);
    const deleted = await pokemonsRepository.delete(userId, id);
    if (!deleted) throw new NotFoundError('Local pokemon', id);
  };

  return {
    browse, getDetailById, getDetailByName, syncById, syncByName, getLocal, getLocalByPokeApiId, update, remove,
  };
};

export { createPokemonsService };
