// config
/** @typedef {import('../config/Logger.js').LoggerLike} LoggerLike */

/**
 * Graceful shutdown/restart (spec §7): on fatal events the process stops
 * accepting connections, drains in-flight requests (bounded by timeoutMs),
 * closes infrastructure (pg pool, Redis), then exits — non-zero on error paths
 * so nodemon/Docker restarts a fresh process.
 */

/**
 * @typedef {object} GracefulShutdownOptions
 * @property {LoggerLike} logger
 * @property {number} [timeoutMs]
 */

/**
 * @typedef {object} GracefulShutdown
 * @property {() => void} register
 * @property {(instance: import('node:http').Server) => void} setServer
 * @property {(closer: () => Promise<unknown>) => void} addCloser
 * @property {(reason: string, exitCode: number) => Promise<void>} shutdown
 */

/**
 * @param {GracefulShutdownOptions} options
 * @returns {GracefulShutdown}
 */
const createGracefulShutdown = ({ logger, timeoutMs = 10_000 }) => {
  let server = null;
  const closers = [];
  let shuttingDown = false;

  const setServer = (instance) => { server = instance; };
  const addCloser = (closer) => { closers.push(closer); };

  const runClosers = async () => {
    await closers.reduce(async (previous, closer) => {
      await previous;
      try {
        await closer();
      } catch (error) {
        logger.warn(`Closer failed during shutdown: ${error.message}`);
      }
    }, Promise.resolve());
  };

  const shutdown = async (reason, exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`Shutting down (${reason})`);
    const force = setTimeout(() => process.exit(exitCode || 1), timeoutMs);
    force.unref();
    if (server) {
      await new Promise((resolve) => { server?.close(() => resolve()); });
    }
    await runClosers();
    clearTimeout(force);
    process.exit(exitCode);
  };

  const register = () => {
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught exception: ${error.stack ?? error.message}`);
      void shutdown('uncaughtException', 1);
    });
    process.on('unhandledRejection', (reason) => {
      const detail = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
      logger.error(`Unhandled rejection: ${detail}`);
      void shutdown('unhandledRejection', 1);
    });
    process.on('SIGTERM', () => { void shutdown('SIGTERM', 0); });
    process.on('SIGINT', () => { void shutdown('SIGINT', 0); });
  };

  return {
    register, setServer, addCloser, shutdown,
  };
};

export { createGracefulShutdown };
