const crypto = require('crypto');

const WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000);
const MAX_ATTEMPTS = Number(process.env.AUTH_RATE_MAX_ATTEMPTS || 8);
const buckets = new Map();

function clientKey(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function rateLimitAuth(req, res, next) {
  const now = Date.now();
  const key = clientKey(req);
  const item = buckets.get(key);
  if (!item || now - item.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, attempts: 1 });
    return next();
  }
  if (item.attempts >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - item.startedAt)) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  item.attempts += 1;
  next();
}

function securityHeaders(_req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.set('Cross-Origin-Opener-Policy', 'same-origin');
  res.set('Cross-Origin-Resource-Policy', 'same-origin');
  res.set('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:");
  if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

function requestId(req, res, next) {
  const id = crypto.randomUUID();
  req.requestId = id;
  res.set('X-Request-Id', id);
  next();
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, item] of buckets) if (now - item.startedAt >= WINDOW_MS) buckets.delete(key);
}
setInterval(cleanupRateLimitBuckets, Math.min(WINDOW_MS, 60_000)).unref();

module.exports = { rateLimitAuth, securityHeaders, requestId };
