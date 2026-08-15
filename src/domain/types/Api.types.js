/**
 * Standard API response shape: every endpoint returns { data, error, msg, meta }.
 *
 * @typedef {object} PagedMeta
 * @property {number} page
 * @property {number} pageSize
 * @property {number} totalCount
 * @property {number} totalPages
 *
 * @typedef {object} ApiResponse
 * @property {*|null} data
 * @property {string|null} error
 * @property {string|null} msg
 * @property {PagedMeta|null} meta
 */

/**
 * Generic paging envelope returned by service-layer listing methods and
 * assembled into ApiResponse.meta (PagedMeta) at the presentation boundary.
 *
 * @typedef {object} PagedItems
 * @property {Array} items
 * @property {number} page
 * @property {number} pageSize
 * @property {number} totalCount
 */

export {};
