// packages
import { Router } from 'express';

// controllers
import * as PokemonsController from '../controllers/PokemonsController.js';

// middleware
import { requireAuth } from '../middleware/Auth.js';

const router = Router();

/**
 * @swagger
 * /api/v1/pokemons:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: US-01 — Paginated Pokemon listing from PokeAPI (sprite, category, mass, skills)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number (1-indexed, default 1)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *         description: Items per page (default 20)
 *     responses:
 *       200:
 *         description: Paginated list of Pokemon
 */
router.get('/', PokemonsController.browse);

/**
 * @swagger
 * /api/v1/pokemons/local:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: Paginated listing of locally replicated Pokemon
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
 *         description: Paginated list of local Pokemon
 */
router.get('/local', PokemonsController.getLocal);

/**
 * @swagger
 * /api/v1/pokemons/{idOrName}:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: US-02 — Detailed view (image, core stats, description, evolution chain)
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *         description: PokeAPI id or Pokemon name
 *     responses:
 *       200:
 *         description: Pokemon detail
 *       404:
 *         description: Pokemon not found
 */
router.get('/:idOrName', PokemonsController.getDetail);

/**
 * @swagger
 * /api/v1/pokemons/{idOrName}/sync:
 *   post:
 *     tags:
 *       - pokemons
 *     summary: US-03 — Replicate a Pokemon from PokeAPI into the local PostgreSQL store
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idOrName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Pokemon replicated locally
 *       404:
 *         description: Pokemon not found in PokeAPI
 */
router.post('/:idOrName/sync', requireAuth, PokemonsController.sync);

/**
 * @swagger
 * /api/v1/pokemons/local/{id}:
 *   put:
 *     tags:
 *       - pokemons
 *     summary: US-04 — Update a locally stored Pokemon
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePokemonDto'
 *     responses:
 *       200:
 *         description: Pokemon updated
 *       400:
 *         description: Malformed payload
 *       404:
 *         description: Pokemon not found
 */
router.put('/local/:id', requireAuth, PokemonsController.update);

/**
 * @swagger
 * /api/v1/pokemons/local/{id}:
 *   delete:
 *     tags:
 *       - pokemons
 *     summary: Delete a locally stored Pokemon
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Pokemon deleted
 *       404:
 *         description: Pokemon not found
 */
router.delete('/local/:id', requireAuth, PokemonsController.remove);

export default router;
