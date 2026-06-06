const { getPool, ensureAdmin } = require('./_lib/db');
const { verifyPassword, signToken } = require('./_lib/auth');
const { withCors } = require('./_lib/handler');

module.exports = withCors(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  await ensureAdmin();

  const { username, password } = req.body || {};
  if (!username || !password) { res.status(400).json({ error: 'username and password required' }); return; }

  const db = getPool();
  const { rows } = await db.query(
    'SELECT id, username, password_hash, role FROM users WHERE username = $1 AND is_active = true',
    [username.trim().toLowerCase()]
  );

  if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
    res.status(401).json({ error: 'Invalid credentials' }); return;
  }

  const token = signToken({ userId: rows[0].id, username: rows[0].username, role: rows[0].role });
  res.status(200).json({ token, role: rows[0].role, username: rows[0].username });
});
