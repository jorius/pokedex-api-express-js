/**
 * Standard API response shape: { data, error, msg, meta }.
 * Every endpoint must return this structure.
 */

const ok = (data, msg = null, meta = null) => ({
  data,
  error: null,
  msg,
  meta,
});

const fail = (error, msg = null) => ({
  data: null,
  error,
  msg,
  meta: null,
});

/**
 * Turns a service-layer PagedItems into the envelope's `meta`. Shared by every
 * paged endpoint so totalPages is derived one way only.
 *
 * @param {import('../../domain/types/Api.types.js').PagedItems} result
 * @returns {import('../../domain/types/Api.types.js').PagedMeta}
 */
const toPagedMeta = (result) => ({
  page: result.page,
  pageSize: result.pageSize,
  totalCount: result.totalCount,
  totalPages: result.pageSize > 0 ? Math.ceil(result.totalCount / result.pageSize) : 0,
});

export { ok, fail, toPagedMeta };
