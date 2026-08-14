// services
import * as PokemonsService from '../services/PokemonsService.js';

// utils
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer — no business logic, delegates to PokemonsService.
 */

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

const getDetail = async (req, res, next) => {
  try {
    res.json(ok(await PokemonsService.getDetail(req.params.idOrName)));
  } catch (error) {
    next(error);
  }
};

const sync = async (req, res, next) => {
  try {
    res.status(201).json(ok(await PokemonsService.sync(req.params.idOrName)));
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
  browse, getDetail, sync, getLocal, update, remove,
};
