const jwt = require('jsonwebtoken');
const { scrypt, randomBytes, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);

async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const key  = await scryptAsync(plain, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scryptAsync(plain, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), key);
}

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function requireRole(req, ...roles) {
  const auth  = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) { const e = new Error('No token'); e.status = 401; throw e; }
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  if (!roles.includes(payload.role)) {
    const e = new Error('Forbidden'); e.status = 403; throw e;
  }
  return payload;
}

module.exports = { hashPassword, verifyPassword, signToken, requireRole };
