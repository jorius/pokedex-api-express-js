// packages
import {
  afterEach, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// lifecycle
import { createGracefulShutdown } from '../../infrastructure/lifecycle/GracefulShutdown.js';

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('GracefulShutdown', () => {
  let exitSpy;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
  });

  afterEach(() => exitSpy.mockRestore());

  it('closes the server, runs closers in order, then exits with the given code', async () => {
    const order = [];
    const server = { close: jest.fn((cb) => { order.push('server'); cb(); }) };
    const shutdown = createGracefulShutdown({ logger: silentLogger, timeoutMs: 1000 });
    shutdown.setServer(server);
    shutdown.addCloser(async () => { order.push('closer1'); });
    shutdown.addCloser(async () => { order.push('closer2'); });
    await shutdown.shutdown('SIGTERM', 0);
    expect(order).toEqual(['server', 'closer1', 'closer2']);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('is idempotent — a second call is a no-op', async () => {
    const server = { close: jest.fn((cb) => cb()) };
    const shutdown = createGracefulShutdown({ logger: silentLogger, timeoutMs: 1000 });
    shutdown.setServer(server);
    await shutdown.shutdown('SIGTERM', 0);
    await shutdown.shutdown('SIGINT', 0);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('survives a closer that throws and still exits', async () => {
    const shutdown = createGracefulShutdown({ logger: silentLogger, timeoutMs: 1000 });
    shutdown.addCloser(async () => { throw new Error('pool already closed'); });
    await shutdown.shutdown('uncaughtException', 1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('force-exits via the timeout when the server never finishes closing', async () => {
    jest.useFakeTimers();
    const server = { close: jest.fn() }; // never calls the callback
    const shutdown = createGracefulShutdown({ logger: silentLogger, timeoutMs: 1000 });
    shutdown.setServer(server);
    shutdown.shutdown('SIGTERM', 0).catch(() => undefined); // never settles by design in this scenario
    await jest.advanceTimersByTimeAsync(1000);
    expect(exitSpy).toHaveBeenCalledWith(1); // forced path exits non-zero even on signal
    jest.useRealTimers();
  });

  it('register wires the four fatal events', () => {
    const onSpy = jest.spyOn(process, 'on');
    const shutdown = createGracefulShutdown({ logger: silentLogger, timeoutMs: 1000 });
    shutdown.register();
    const events = onSpy.mock.calls.map(([name]) => name);
    expect(events).toEqual(expect.arrayContaining(['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT']));
    onSpy.mock.calls.forEach(([name, handler]) => {
      if (['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'].includes(name)) {
        process.removeListener(name, handler);
      }
    });
    onSpy.mockRestore();
  });

  describe('fired handler bodies', () => {
    const fatalEvents = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'];

    // Jest installs its own uncaughtException/unhandledRejection listeners to fail the run on
    // an unexpected error. Emitting these events for real would trip those too, so each test
    // snapshots and removes them for the duration, then restores them afterwards — deterministic,
    // and only OUR registered listener observes the emitted event.
    let savedListeners;

    beforeEach(() => {
      savedListeners = {};
      fatalEvents.forEach((event) => {
        savedListeners[event] = process.listeners(event);
        process.removeAllListeners(event);
      });
    });

    afterEach(() => {
      fatalEvents.forEach((event) => {
        process.removeAllListeners(event);
        (savedListeners[event] ?? []).forEach((listener) => process.on(event, listener));
      });
    });

    const flush = async () => new Promise((resolve) => { setImmediate(resolve); });

    it('logs the stack and shuts down on a real uncaughtException event', async () => {
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const shutdown = createGracefulShutdown({ logger, timeoutMs: 1000 });
      shutdown.register();
      const error = new Error('crash');
      process.emit('uncaughtException', error);
      await flush();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(error.stack));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs the rejection stack and shuts down on a real unhandledRejection event', async () => {
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
      const shutdown = createGracefulShutdown({ logger, timeoutMs: 1000 });
      shutdown.register();
      const reason = new Error('boom');
      process.emit('unhandledRejection', reason, Promise.resolve());
      await flush();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(reason.stack));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
