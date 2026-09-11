const crypto = require('crypto');

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(String(password || ''), salt, 64, { N: 16384, r: 8, p: 1 }, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt$16384$8$1$${salt}$${derived.toString('hex')}`);
    });
  });
}

function verifyPassword(password, encoded) {
  return new Promise((resolve, reject) => {
    try {
      const [scheme, n, r, p, salt, expected] = String(encoded || '').split('$');
      if (scheme !== 'scrypt' || !salt || !expected) return resolve(false);
      crypto.scrypt(String(password || ''), salt, 64, { N: Number(n), r: Number(r), p: Number(p) }, (err, derived) => {
        if (err) return reject(err);
        const actual = Buffer.from(derived.toString('hex'), 'hex');
        const target = Buffer.from(expected, 'hex');
        resolve(actual.length === target.length && crypto.timingSafeEqual(actual, target));
      });
    } catch (_) { resolve(false); }
  });
}

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be configured with at least 32 characters');
  return value;
}

function signAccessToken(payload, expiresInSeconds = 60 * 60 * 12) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  const unsigned = `${header}.${body}`;
  const signature = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function verifyAccessToken(token) {
  const [header, body, signature] = String(token || '').split('.');
  if (!header || !body || !signature) throw new Error('Invalid token');
  const unsigned = `${header}.${body}`;
  const expected = crypto.createHmac('sha256', secret()).update(unsigned).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('Invalid token');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

module.exports = { hashPassword, verifyPassword, signAccessToken, verifyAccessToken };
