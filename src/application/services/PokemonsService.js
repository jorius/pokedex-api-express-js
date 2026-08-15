// rules
import {
  DEFAULT_BALL_TYPE, ballName, baseStatTotal, catchChance, isBallType, rollCatch, secureRandom,
} from '../../domain/rules/EconomyRules.js';
import { validatePagination } from '../../domain/rules/Pagination.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * Business logic for the four Pokemon user stories. Lookup by id and by name
 * are separate operations (RESTful: one route per identifier type); the
 * internal PokeAPI gateway accepts either.
 *
 * Since iteration three a "sync" is a CATCH ATTEMPT: it costs a ball and only
 * writes a collection entry when the server-rolled throw succeeds. That is why
 * this service depends on the economy repository — the ball ledger and the
 * collection are two halves of one user action, and neither the odds nor the
 * roll are ever exposed to the caller.
 *
 * @typedef {import('../../domain/types/Economy.types.js').BallType} BallType
 * @typedef {import('../../domain/types/Economy.types.js').CatchResult} CatchResult
 */

const MAX_FIELD_LENGTH = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = ['localizedName', 'region', 'classificationTag', 'description'];

/**
 * An omitted (or blank) ballType means the starter Poké Ball, not a rejection.
 *
 * @param {*} ballType
 * @returns {BallType}
 */
const validateBallType = (ballType) => {
  if (ballType === undefined || ballType === null || ballType === '') return DEFAULT_BALL_TYPE;
  if (!isBallType(ballType)) throw new ValidationError(`'${String(ballType)}' is not a valid ball type`);
  return ballType;
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
 * @param {import('../ports/EconomyRepositoryPort.js').EconomyRepositoryPort} deps.economyRepository
 * @param {import('../../domain/rules/EconomyRules.js').RandomSource} [deps.random]
 *   Injectable so tests can force a catch or an escape; production uses the crypto-backed default.
 */
const createPokemonsService = ({
  pokeApiClient, pokemonsRepository, economyRepository, random = secureRandom,
}) => {
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

  /**
   * One catch attempt. Ordering is deliberate and part of the contract:
   *   1. the ball type is validated before any I/O — a bad one is a 400 that
   *      costs nothing;
   *   2. the pokemon is resolved next, so a 404 never costs the player a ball;
   *   3. the ball is then consumed atomically, and is spent whether the throw
   *      lands or the pokemon escapes;
   *   4. the chance is computed from the ball and the pokemon's own rarity, and
   *      the roll happens here on the server;
   *   5. only a successful throw upserts a collection entry — an escape writes
   *      nothing and reports `entry: null`.
   *
   * @returns {Promise<CatchResult>}
   */
  const attemptCatch = async (userId, detail, ballType) => {
    const remainingBalls = await economyRepository.consumeBall(userId, ballType);
    if (remainingBalls === null) throw new ConflictError(`No ${ballName(ballType)} left`);

    const chance = catchChance(ballType, detail.pokeApiId, baseStatTotal(detail.stats));
    const caught = rollCatch(chance, random);
    const entry = caught ? await pokemonsRepository.upsertFromDetail(userId, detail) : null;

    return {
      caught, ballType, remainingBalls, chance, entry,
    };
  };

  const syncById = async (userId, id, ballType) => {
    const type = validateBallType(ballType);
    return attemptCatch(userId, await getDetailById(id), type);
  };

  const syncByName = async (userId, name, ballType) => {
    const type = validateBallType(ballType);
    return attemptCatch(userId, await getDetailByName(name), type);
  };

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
