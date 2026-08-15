// container
import { pokemonsService } from '../../Container.js';
// utils
import { ValidationError } from '../../domain/errors/ValidationError.js';
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer — no business logic, delegates to PokemonsService.
 * Lookup by id and lookup by name are separate endpoints (RESTful:
 * one route per identifier type).
 */

const NUMERIC_ID_PATTERN = /^\d+$/;

// Number('1e3'), Number('0x10') and Number('  7 ') all coerce to a finite
// number, so Number() alone is not a safe id parser. Require the raw param to
// be composed entirely of ASCII digits BEFORE converting — anything else is a
// 400, not a coercion.
const parseNumericParam = (raw) => {
  if (typeof raw !== 'string' || !NUMERIC_ID_PATTERN.test(raw)) {
    throw new ValidationError(`'${raw}' is not a valid numeric id`);
  }
  return Number(raw);
};

// Local-collection routes sit behind the authenticate middleware, which
// guarantees req.user is populated before these handlers run.
const callerId = (req) => req.user.id;

/** @param {{ page: number, pageSize: number, totalCount: number }} result */
const toMeta = (result) => ({
  page: result.page,
  pageSize: result.pageSize,
  totalCount: result.totalCount,
  totalPages: result.pageSize > 0 ? Math.ceil(result.totalCount / result.pageSize) : 0,
});

const browse = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await pokemonsService.browse(page, pageSize);
    res.json(ok(result.items, null, toMeta(result)));
  } catch (error) {
    next(error);
  }
};

const getDetailById = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.getDetailById(parseNumericParam(req.params.id))));
  } catch (error) {
    next(error);
  }
};

const getDetailByName = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.getDetailByName(req.params.name)));
  } catch (error) {
    next(error);
  }
};

const syncById = async (req, res, next) => {
  try {
    res.status(201).json(ok(await pokemonsService.syncById(callerId(req), parseNumericParam(req.params.id))));
  } catch (error) {
    next(error);
  }
};

const syncByName = async (req, res, next) => {
  try {
    res.status(201).json(ok(await pokemonsService.syncByName(callerId(req), req.params.name)));
  } catch (error) {
    next(error);
  }
};

const getLocal = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await pokemonsService.getLocal(callerId(req), page, pageSize);
    res.json(ok(result.items, null, toMeta(result)));
  } catch (error) {
    next(error);
  }
};

const getLocalByPokeApiId = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.getLocalByPokeApiId(callerId(req), parseNumericParam(req.params.pokeApiId))));
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.update(callerId(req), req.params.id, req.body)));
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await pokemonsService.remove(callerId(req), req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export {
  browse, getDetailById, getDetailByName, syncById, syncByName, getLocal, getLocalByPokeApiId, update, remove,
};
