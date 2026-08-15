// packages
import { Router } from 'express';

// controllers
import * as EconomyController from '../controllers/EconomyController.js';
// middleware
import { authenticate } from '../middleware/Auth.js';

const router = Router();

/**
 * @swagger
 * /api/economy/catalogue:
 *   get:
 *     tags:
 *       - economy
 *     summary: Ball catalogue — type, display name, price in credits and base catch rate
 *     description: Public on purpose, so the shop can render its prices before anyone logs in.
 *     responses:
 *       200:
 *         description: The four ball types, cheapest first
 */
router.get('/catalogue', EconomyController.getCatalogue);

/**
 * @swagger
 * /api/economy/wallet:
 *   get:
 *     tags:
 *       - economy
 *     summary: The caller's credit balance and ball inventory
 *     description: Always reports all four ball types in catalogue order, with quantity 0 for types never owned.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The caller's wallet
 *       401:
 *         description: Missing or invalid Bearer token
 *       404:
 *         description: The caller has no wallet (an account created before the economy existed)
 */
router.get('/wallet', authenticate, EconomyController.getWallet);

/**
 * @swagger
 * /api/economy/shop/buy:
 *   post:
 *     tags:
 *       - economy
 *     summary: Buy balls — debits credits and credits inventory atomically
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BuyBallsDto'
 *     responses:
 *       200:
 *         description: Purchase completed, updated wallet returned
 *       400:
 *         description: Unknown ball type or quantity outside 1..99
 *       401:
 *         description: Missing or invalid Bearer token
 *       409:
 *         description: Not enough credits
 */
router.post('/shop/buy', authenticate, EconomyController.buy);

/**
 * @swagger
 * /api/economy/slots/spin:
 *   post:
 *     tags:
 *       - economy
 *     summary: Spin the slots — costs 100 credits, rolls three reels server-side, pays out atomically
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Spin resolved — reels, outcome, payout and the updated wallet
 *       401:
 *         description: Missing or invalid Bearer token
 *       409:
 *         description: Not enough credits
 */
router.post('/slots/spin', authenticate, EconomyController.spin);

/**
 * @swagger
 * /api/economy/slots/history:
 *   get:
 *     tags:
 *       - economy
 *     summary: The caller's spin history, most recent first
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated spin results
 *       400:
 *         description: Invalid pagination
 *       401:
 *         description: Missing or invalid Bearer token
 */
router.get('/slots/history', authenticate, EconomyController.getSpinHistory);

export default router;
