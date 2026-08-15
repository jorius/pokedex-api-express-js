// container
import { economyService } from '../../Container.js';
// utils
import { ok, toPagedMeta } from '../utils/Response.js';

/**
 * Thin HTTP layer for the pokeball economy — no business logic, no rolls, no
 * arithmetic: it hands the caller id and the raw body through to
 * EconomyService and shapes the result into the standard envelope.
 */

// Every route except the catalogue sits behind the authenticate middleware,
// which guarantees req.user is populated before these handlers run.
const callerId = (req) => req.user.id;

const getCatalogue = (_req, res) => {
  res.json(ok(economyService.getCatalogue()));
};

const getWallet = async (req, res, next) => {
  try {
    res.json(ok(await economyService.getWallet(callerId(req))));
  } catch (error) {
    next(error);
  }
};

const buy = async (req, res, next) => {
  try {
    res.json(ok(await economyService.buy(callerId(req), req.body?.ballType, req.body?.quantity)));
  } catch (error) {
    next(error);
  }
};

const spin = async (req, res, next) => {
  try {
    res.json(ok(await economyService.spin(callerId(req))));
  } catch (error) {
    next(error);
  }
};

const getSpinHistory = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await economyService.getSpinHistory(callerId(req), page, pageSize);
    res.json(ok(result.items, null, toPagedMeta(result)));
  } catch (error) {
    next(error);
  }
};

const claimDaily = async (req, res, next) => {
  try {
    res.json(ok(await economyService.claimDaily(callerId(req))));
  } catch (error) {
    next(error);
  }
};

export {
  getCatalogue, getWallet, buy, spin, getSpinHistory, claimDaily,
};
