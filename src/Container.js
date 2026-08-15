// config
import { env } from './infrastructure/config/Env.js';
import { logger } from './infrastructure/config/Logger.js';
// cache
import { createMemoryCache } from './infrastructure/cache/MemoryCache.js';
import { createRedisCache } from './infrastructure/cache/RedisCache.js';
// clients
import { createPokeApiClient } from './infrastructure/clients/PokeApiClient.js';
// repositories
import { pokemonsRepository } from './infrastructure/repositories/PokemonsRepository.js';
import { refreshTokensRepository } from './infrastructure/repositories/RefreshTokensRepository.js';
import { usersRepository } from './infrastructure/repositories/UsersRepository.js';
// services
import { createAuthService } from './application/services/AuthService.js';
import { createPokemonsService } from './application/services/PokemonsService.js';

/**
 * Composition root. ESM evaluates this module exactly once per process, which
 * makes every instance below a singleton — including the PokeAPI client
 * (spec §5: singleton pattern for external API consumption). Server.js owns
 * redisCache.connect()/close().
 */

const redisCache = createRedisCache({ url: env.redisUrl, logger });

const pokeApiClient = createPokeApiClient({
  baseUrl: env.pokeApiBaseUrl,
  l1: createMemoryCache(),
  l2: redisCache,
  l1TtlSeconds: env.cacheL1TtlSeconds,
  l2TtlSeconds: env.cacheL2TtlSeconds,
});

const authService = createAuthService({ usersRepository, refreshTokensRepository, env });
const pokemonsService = createPokemonsService({ pokeApiClient, pokemonsRepository });

export { authService, pokemonsService, redisCache };
