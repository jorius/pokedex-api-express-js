// rules
import {
  BALL_CATALOGUE,
  DAILY_BONUS,
  SAFETY_NET_BALL_GRANT,
  SAFETY_NET_CREDITS_THRESHOLD,
  SLOT_COST,
  STARTER_BALL_TYPE,
  ballPrice,
  dailyClaimCutoff,
  isBallType,
  isDailyAvailable,
  nextDailyClaimAt,
  rollSpin,
  secureRandom,
} from '../../domain/rules/EconomyRules.js';
import { validatePagination } from '../../domain/rules/Pagination.js';
// utils
import { ConflictError } from '../../domain/errors/ConflictError.js';
import { NotFoundError } from '../../domain/errors/NotFoundError.js';
import { ValidationError } from '../../domain/errors/ValidationError.js';

/**
 * The shop, the slots minigame and (iteration four) the two ways credits come
 * back INTO a wallet without spending anything: the daily bonus and the safety
 * net. This service owns validation and the translation of a rejected atomic
 * guard into an HTTP-shaped error; the odds, prices, payouts and cooldowns all
 * come from the rules module, and the atomicity comes from the repository.
 * Every roll is server-side — nothing a client sends can influence an outcome,
 * only which ball type or how many balls it is buying.
 *
 * @typedef {import('../../domain/types/Economy.types.js').BallType} BallType
 * @typedef {import('../../domain/types/Economy.types.js').DailyClaim} DailyClaim
 * @typedef {import('../../domain/types/Economy.types.js').WalletStatus} WalletStatus
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
 * @param {() => Date} [deps.now]
 *   Injectable so tests can travel through the 24h daily cooldown instead of sleeping.
 */
const createEconomyService = ({ economyRepository, random = secureRandom, now = () => new Date() }) => {
  // Public (no auth): the shop must render its prices before anyone logs in.
  const getCatalogue = () => BALL_CATALOGUE.map((ball) => ({ ...ball }));

  /**
   * The wallet read doubles as the anti-softlock checkpoint (plan §1.D): the
   * repository evaluates the safety net in the same transaction and reports
   * whether THIS read granted the balls, so the client can toast it exactly
   * once — a second read finds balls in the inventory and answers false.
   *
   * Key order is the cross-service contract: credits, balls, dailyAvailable,
   * nextDailyAt, safetyNetGranted.
   *
   * @param {string} userId
   * @returns {Promise<WalletStatus>}
   */
  const getWallet = async (userId) => {
    const read = await economyRepository.getWallet(userId, {
      creditsThreshold: SAFETY_NET_CREDITS_THRESHOLD,
      ballType: STARTER_BALL_TYPE,
      quantity: SAFETY_NET_BALL_GRANT,
    });
    if (!read) throw new NotFoundError('Wallet', userId);

    const { wallet, safetyNetGranted } = read;
    const dailyAvailable = isDailyAvailable(wallet.lastDailyClaimAt, now());

    return {
      credits: wallet.credits,
      balls: wallet.balls,
      dailyAvailable,
      // Null while the bonus is claimable: there is nothing to count down to.
      nextDailyAt: dailyAvailable || !wallet.lastDailyClaimAt ? null : nextDailyClaimAt(wallet.lastDailyClaimAt).toISOString(),
      safetyNetGranted,
    };
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

  /**
   * The daily bonus. The cooldown is NEVER evaluated here: this service only
   * hands the repository the clock reading and the cutoff derived from it, and
   * the guard lives in the WHERE clause of a single conditional UPDATE. A
   * rejected guard is indistinguishable from a second click during the window,
   * which is exactly the 409 the contract promises.
   *
   * @param {string} userId
   * @returns {Promise<DailyClaim>}
   */
  const claimDaily = async (userId) => {
    const claimedAt = now();
    const claim = await economyRepository.claimDaily({
      userId, amount: DAILY_BONUS, claimedAt, cutoff: dailyClaimCutoff(claimedAt),
    });
    if (!claim) throw new ConflictError('Daily bonus already claimed');

    return {
      credits: claim.wallet.credits,
      balls: claim.wallet.balls,
      nextClaimAt: nextDailyClaimAt(claim.claimedAt).toISOString(),
    };
  };

  return {
    getCatalogue, getWallet, buy, spin, getSpinHistory, claimDaily,
  };
};

export { createEconomyService, MIN_BUY_QUANTITY, MAX_BUY_QUANTITY };
