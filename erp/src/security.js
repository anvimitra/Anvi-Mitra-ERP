const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const rounds = 12;

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) throw new Error('Password must contain at least 8 characters');
  return bcrypt.hash(password, rounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signAccessToken(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET') throw new Error('JWT_SECRET is not configured');
  return jwt.sign(payload, secret, { expiresIn: '15m', issuer: 'lsk-erp' });
}

function verifyAccessToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'CHANGE_ME_TO_A_LONG_RANDOM_SECRET') throw new Error('JWT_SECRET is not configured');
  return jwt.verify(token, secret, { issuer: 'lsk-erp' });
}

module.exports = { hashPassword, verifyPassword, signAccessToken, verifyAccessToken };
