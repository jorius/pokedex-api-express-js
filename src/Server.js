// app
import { createApp } from './presentation/App.js';
// config
import { env, validateEnv } from './infrastructure/config/Env.js';
import { logger } from './infrastructure/config/Logger.js';
// container
import { redisCache } from './Container.js';
// database
import { pool } from './infrastructure/database/Database.js';
// lifecycle
import { createGracefulShutdown } from './infrastructure/lifecycle/GracefulShutdown.js';

validateEnv(env); // fail fast: refuse to boot with a weak secret or garbage numbers

const gracefulShutdown = createGracefulShutdown({ logger });
gracefulShutdown.register();

// closers run in registration order: Redis first (fast, independent), then the pg pool.
// Both redisCache and pool exist at import time (Container.js / Database.js), and their
// close() paths are safe even pre-connect (redis close checks isOpen; pool.end on an
// unused pool resolves), so registering them here — before the server is even listening —
// closes the gap where a fatal event between now and setServer() would skip teardown.
gracefulShutdown.addCloser(() => redisCache.close());
gracefulShutdown.addCloser(() => pool.end());

await redisCache.connect();

const app = createApp();

// No host argument on purpose: Node's net.Server.listen defaults to the unspecified address
// (:: with dual-stack, i.e. every interface), so the API already answers on the machine's LAN
// address as well as localhost — a phone at http://192.168.0.254:3000 reaches it. Passing an
// explicit host here would be the thing that breaks LAN access, not the thing that enables it.
const server = app.listen(env.port, () => {
  logger.info(`Pokedex API listening on port ${env.port} (${env.nodeEnv})`);
});

gracefulShutdown.setServer(server);
