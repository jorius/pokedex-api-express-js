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

export { ok, fail };
