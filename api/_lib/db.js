const { Pool }        = require('pg');
const { hashPassword } = require('./auth');

let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

let adminSeeded = false;
async function ensureAdmin() {
  if (adminSeeded) return;
  adminSeeded = true;
  if (!process.env.ADMIN_PASSWORD) return;
  const db = getPool();
  const { rowCount } = await db.query('SELECT 1 FROM users WHERE is_active = true LIMIT 1');
  if (rowCount === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const hash     = await hashPassword(process.env.ADMIN_PASSWORD);
    await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING`,
      [username, hash]
    );
  }
}

module.exports = { getPool, ensureAdmin };
