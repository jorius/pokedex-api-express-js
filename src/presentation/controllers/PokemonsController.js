// services
import { createPokemonsService } from '../../application/services/PokemonsService.js';
// cache
import { createMemoryCache } from '../../infrastructure/cache/MemoryCache.js';
import { createRedisCache } from '../../infrastructure/cache/RedisCache.js';
// clients
import { createPokeApiClient } from '../../infrastructure/clients/PokeApiClient.js';
// config
import { env } from '../../infrastructure/config/Env.js';
import { logger } from '../../infrastructure/config/Logger.js';
// repositories
import { pokemonsRepository } from '../../infrastructure/repositories/PokemonsRepository.js';
// utils
import { ok } from '../utils/Response.js';

/**
 * Thin HTTP layer — no business logic, delegates to PokemonsService.
 * Lookup by id and lookup by name are separate endpoints (RESTful:
 * one route per identifier type).
 *
 * Interim wiring: builds its own PokeApiClient (memory L1 + Redis L2) rather than
 * duplicating full composition-root wiring here. The Redis cache is intentionally
 * left unconnected — connect() is owned by Task 12's Server bootstrap; an
 * unconnected RedisCache degrades to a no-op (see RedisCache.js), which is the
 * correct interim behavior. Task 11 replaces this with Container-driven wiring.
 */
const pokeApiClient = createPokeApiClient({
  baseUrl: env.pokeApiBaseUrl,
  l1: createMemoryCache(),
  l2: createRedisCache({ url: env.redisUrl, logger }),
  l1TtlSeconds: env.cacheL1TtlSeconds,
  l2TtlSeconds: env.cacheL2TtlSeconds,
});

const pokemonsService = createPokemonsService({ pokeApiClient, pokemonsRepository });

const browse = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await pokemonsService.browse(page, pageSize);
    res.json(ok(result.items, null, result.meta));
  } catch (error) {
    next(error);
  }
};

const getDetailById = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.getDetailById(Number(req.params.id))));
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
    res.status(201).json(ok(await pokemonsService.syncById(Number(req.params.id))));
  } catch (error) {
    next(error);
  }
};

const syncByName = async (req, res, next) => {
  try {
    res.status(201).json(ok(await pokemonsService.syncByName(req.params.name)));
  } catch (error) {
    next(error);
  }
};

const getLocal = async (req, res, next) => {
  try {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 20);
    const result = await pokemonsService.getLocal(page, pageSize);
    res.json(ok(result.items, null, result.meta));
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    res.json(ok(await pokemonsService.update(req.params.id, req.body)));
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await pokemonsService.remove(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export {
  browse, getDetailById, getDetailByName, syncById, syncByName, getLocal, update, remove,
};
