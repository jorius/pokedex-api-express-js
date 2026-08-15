// services
import * as PokemonsService from '../../application/services/PokemonsService.js';

// utils
import { ok } from '../utils/Response.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * Thin HTTP layer — no business logic, delegates to PokemonsService.
 * Lookup by id and lookup by name are separate endpoints (RESTful:
 * one route per identifier type).
 */

const parseNumericId = (raw) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(`'${raw}' is not a valid numeric id`);
  }
  return id;
};

const browse = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await PokemonsService.browse(page, pageSize);
    res.json(ok(result.items, null, result.meta));
  } catch (error) {
    next(error);
  }
};

const getDetailById = async (req, res, next) => {
  try {
    res.json(ok(await PokemonsService.getDetailById(parseNumericId(req.params.id))));
  } catch (error) {
    next(error);
  }
};

const getDetailByName = async (req, res, next) => {
  try {
    res.json(ok(await PokemonsService.getDetailByName(req.params.name)));
  } catch (error) {
    next(error);
  }
};

const syncById = async (req, res, next) => {
  try {
    res.status(201).json(ok(await PokemonsService.syncById(parseNumericId(req.params.id))));
  } catch (error) {
    next(error);
  }
};

const syncByName = async (req, res, next) => {
  try {
    res.status(201).json(ok(await PokemonsService.syncByName(req.params.name)));
  } catch (error) {
    next(error);
  }
};

const getLocal = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await PokemonsService.getLocal(page, pageSize);
    res.json(ok(result.items, null, result.meta));
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    res.json(ok(await PokemonsService.update(req.params.id, req.body)));
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await PokemonsService.remove(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export {
  browse, getDetailById, getDetailByName, syncById, syncByName, getLocal, update, remove,
};
