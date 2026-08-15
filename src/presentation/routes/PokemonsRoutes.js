// packages
import { Router } from 'express';

// controllers
import * as PokemonsController from '../controllers/PokemonsController.js';

// middleware
import { authenticate } from '../middleware/Auth.js';

const router = Router();

/**
 * @swagger
 * /api/pokemons:
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
 * /api/pokemons/local:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: Paginated listing of the caller's Pokemon collection
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
 *         description: Paginated list of the caller's collection entries
 *       401:
 *         description: Missing or invalid Bearer token
 */
router.get('/local', authenticate, PokemonsController.getLocal);

/**
 * @swagger
 * /api/pokemons/local/by-poke-api-id/{pokeApiId}:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: The caller's collection entry for a PokeAPI id (captured check)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: pokeApiId
 *         required: true
 *         schema:
 *           type: integer
 *         description: PokeAPI numeric id
 *     responses:
 *       200:
 *         description: The caller's collection entry for that PokeAPI id
 *       400:
 *         description: Non-numeric id
 *       401:
 *         description: Missing or invalid Bearer token
 *       404:
 *         description: The caller has not captured that Pokemon
 */
// Registered before the '/local/:id' routes: literal segments must win over
// the param route, or 'by-poke-api-id' would be captured as a local id.
router.get('/local/by-poke-api-id/:pokeApiId', authenticate, PokemonsController.getLocalByPokeApiId);

/**
 * @swagger
 * /api/pokemons/name/{name}:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: US-02 — Detailed view by Pokemon name (image, core stats, description, evolution chain)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Pokemon name
 *     responses:
 *       200:
 *         description: Pokemon detail
 *       404:
 *         description: Pokemon not found
 */
router.get('/name/:name', PokemonsController.getDetailByName);

/**
 * @swagger
 * /api/pokemons/{id}:
 *   get:
 *     tags:
 *       - pokemons
 *     summary: US-02 — Detailed view by PokeAPI id (image, core stats, description, evolution chain)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: PokeAPI numeric id
 *     responses:
 *       200:
 *         description: Pokemon detail
 *       400:
 *         description: Non-numeric id
 *       404:
 *         description: Pokemon not found
 */
router.get('/:id', PokemonsController.getDetailById);

/**
 * @swagger
 * /api/pokemons/{id}/sync:
 *   post:
 *     tags:
 *       - pokemons
 *     summary: US-03 — Catch a Pokemon (by PokeAPI id) into the caller's collection
 *     description: >
 *       Costs one ball of the chosen type (default poke), consumed whether the throw lands or the
 *       pokemon escapes. The catch chance is rolled server-side from the ball's base rate and the
 *       pokemon's rarity. 201 when caught (an entry was created), 200 when it escaped.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: ballType
 *         schema:
 *           type: string
 *           enum: [poke, great, ultra, master]
 *         description: Alternative to the request body
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CatchDto'
 *     responses:
 *       200:
 *         description: The pokemon escaped — a ball was consumed, no entry created
 *       201:
 *         description: Pokemon caught and replicated locally
 *       400:
 *         description: Unknown ball type
 *       404:
 *         description: Pokemon not found in PokeAPI (no ball is consumed)
 *       409:
 *         description: No balls of that type left
 */
router.post('/:id/sync', authenticate, PokemonsController.syncById);

/**
 * @swagger
 * /api/pokemons/name/{name}/sync:
 *   post:
 *     tags:
 *       - pokemons
 *     summary: US-03 — Catch a Pokemon (by name) into the caller's collection
 *     description: >
 *       Costs one ball of the chosen type (default poke), consumed whether the throw lands or the
 *       pokemon escapes. The catch chance is rolled server-side from the ball's base rate and the
 *       pokemon's rarity. 201 when caught (an entry was created), 200 when it escaped.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: ballType
 *         schema:
 *           type: string
 *           enum: [poke, great, ultra, master]
 *         description: Alternative to the request body
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CatchDto'
 *     responses:
 *       200:
 *         description: The pokemon escaped — a ball was consumed, no entry created
 *       201:
 *         description: Pokemon caught and replicated locally
 *       400:
 *         description: Unknown ball type
 *       404:
 *         description: Pokemon not found in PokeAPI (no ball is consumed)
 *       409:
 *         description: No balls of that type left
 */
router.post('/name/:name/sync', authenticate, PokemonsController.syncByName);

/**
 * @swagger
 * /api/pokemons/local/{id}:
 *   put:
 *     tags:
 *       - pokemons
 *     summary: US-04 — Update one of the caller's collection entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection entry id (uuid)
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
router.put('/local/:id', authenticate, PokemonsController.update);

/**
 * @swagger
 * /api/pokemons/local/{id}:
 *   delete:
 *     tags:
 *       - pokemons
 *     summary: Delete one of the caller's collection entries
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Collection entry id (uuid)
 *     responses:
 *       204:
 *         description: Pokemon deleted
 *       404:
 *         description: Pokemon not found
 */
router.delete('/local/:id', authenticate, PokemonsController.remove);

export default router;
