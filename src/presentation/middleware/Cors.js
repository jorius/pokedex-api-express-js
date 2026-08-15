/**
 * Permissive CORS for browser clients. The frontend (http://localhost:5173) talks to
 * this API with Bearer tokens in the Authorization header and JSON bodies — there are
 * no cookies in play, so `Access-Control-Allow-Origin: *` cannot leak session state the
 * way it could with cookie-based auth. Permissive by design: token auth, no cookies,
 * study project.
 *
 * Registered first in App.js, before the JSON body parser and routing, so a preflight
 * OPTIONS request is answered here and never has to survive body parsing, auth, or the
 * 404 catch-all.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
const cors = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
};

export { cors };
