// rules
import {
  BALL_CATALOGUE, SLOT_COST, ballPrice, isBallType, rollSpin, secureRandom,
} from '../../domain/rules/EconomyRules.js';
import { validatePagination } from '../../domain/rules/Pagination.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * The shop and the slots minigame. This service owns validation and the
 * translation of a rejected atomic guard into an HTTP-shaped error; the odds,
 * prices and payouts all come from the rules module, and the atomicity comes
 * from the repository. Every roll is server-side — nothing a client sends can
 * influence an outcome, only which ball type or how many balls it is buying.
 *
 * @typedef {import('../../domain/types/Economy.types.js').BallType} BallType
 */

const MIN_BUY_QUANTITY = 1;
const MAX_BUY_QUANTITY = 99;

/**
 * @param {*} ballType
 * @returns {BallType}
 */
const validateBallType = (ballType) => {
  if (!isBallType(ballType)) throw new ValidationError(`'${String(ballType)}' is not a valid ball type`);
  return ballType;
};

/**
 * @param {*} quantity
 * @returns {number}
 */
const validateQuantity = (quantity) => {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < MIN_BUY_QUANTITY || quantity > MAX_BUY_QUANTITY) {
    throw new ValidationError(`quantity must be an integer between ${MIN_BUY_QUANTITY} and ${MAX_BUY_QUANTITY}`);
  }
  return quantity;
};

/**
 * @param {object} deps
 * @param {import('../ports/EconomyRepositoryPort.js').EconomyRepositoryPort} deps.economyRepository
 * @param {import('../../domain/rules/EconomyRules.js').RandomSource} [deps.random]
 *   Injectable so tests can pin a roll; production uses the crypto-backed default.
 */
const createEconomyService = ({ economyRepository, random = secureRandom }) => {
  // Public (no auth): the shop must render its prices before anyone logs in.
  const getCatalogue = () => BALL_CATALOGUE.map((ball) => ({ ...ball }));

  const getWallet = async (userId) => {
    const wallet = await economyRepository.getWallet(userId);
    if (!wallet) throw new NotFoundError('Wallet', userId);
    return wallet;
  };

  const buy = async (userId, ballType, quantity) => {
    const type = validateBallType(ballType);
    const amount = validateQuantity(quantity);
    const wallet = await economyRepository.purchase({
      userId, ballType: type, quantity: amount, cost: ballPrice(type) * amount,
    });
    if (!wallet) throw new ConflictError('Not enough credits');
    return wallet;
  };

  const spin = async (userId) => {
    // Rolled BEFORE the debit and silently discarded if the debit is refused.
    // The roll is pure and has no side effects, so throwing it away costs
    // nothing — and it keeps the wallet guard a single atomic conditional
    // UPDATE instead of a check-then-charge read-then-write.
    const roll = rollSpin(random);
    const wallet = await economyRepository.applySpin({
      userId, cost: SLOT_COST, reels: roll.reels, payout: roll.payout, outcome: roll.outcome,
    });
    if (!wallet) throw new ConflictError('Not enough credits');
    return { ...roll, wallet };
  };

  const getSpinHistory = async (userId, page, pageSize) => {
    validatePagination(page, pageSize);
    return economyRepository.findSpinPage(userId, page, pageSize);
  };

  return {
    getCatalogue, getWallet, buy, spin, getSpinHistory,
  };
};

export { createEconomyService, MIN_BUY_QUANTITY, MAX_BUY_QUANTITY };
