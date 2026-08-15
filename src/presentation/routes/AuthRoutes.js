// packages
import { Router } from 'express';

// controllers
import * as AuthController from '../controllers/AuthController.js';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags:
 *       - auth
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterDto'
 *     responses:
 *       201:
 *         description: User registered, token issued
 *       400:
 *         description: Validation failed
 *       409:
 *         description: Email already registered
 */
router.post('/register', AuthController.register);

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags:
 *       - auth
 *     summary: Authenticate and receive a JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginDto'
 *     responses:
 *       200:
 *         description: Token issued
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', AuthController.login);

export default router;
