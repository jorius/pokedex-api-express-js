/**
 * Minimal logger wrapper so application code never calls console directly
 * (keeps the no-console lint rule meaningful elsewhere).
 */

/**
 * @typedef {object} LoggerLike
 * @property {(message: string) => void} info
 * @property {(message: string) => void} warn
 * @property {(message: string) => void} error
 */

/* eslint-disable no-console */
/** @type {LoggerLike} */
const logger = {
  info: (message) => console.info(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};
/* eslint-enable no-console */

export { logger };
