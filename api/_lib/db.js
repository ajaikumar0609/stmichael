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
  if (!process.env.ADMIN_PASSWORD) return;
  const db = getPool();
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const { rows } = await db.query('SELECT id FROM users WHERE username = $1', [username]);
  if (rows.length === 0) {
    const hash = await hashPassword(process.env.ADMIN_PASSWORD);
    await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING`,
      [username, hash]
    );
  }
  adminSeeded = true;
}

module.exports = { getPool, ensureAdmin };
