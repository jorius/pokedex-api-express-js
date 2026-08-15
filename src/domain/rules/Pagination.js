// utils
import { ValidationError } from '../errors/ValidationError.js';

/**
 * Paging limits and their rejection messages, in ONE place: every paged
 * endpoint in every pokedex backend answers a bad page/pageSize with these
 * exact strings, so they cannot drift between listings (collection, spin
 * history, ...) or between services.
 */

const MAX_PAGE_SIZE = 100;

/**
 * @param {number} page
 * @param {number} pageSize
 */
const validatePagination = (page, pageSize) => {
  if (!Number.isInteger(page) || page < 1) throw new ValidationError('page must be an integer >= 1');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new ValidationError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
};

export { MAX_PAGE_SIZE, validatePagination };
