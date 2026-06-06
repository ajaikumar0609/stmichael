const { getPool }                  = require('./_lib/db');
const { hashPassword, requireRole } = require('./_lib/auth');
const { withCors }                  = require('./_lib/handler');

module.exports = withCors(async (req, res) => {
  requireRole(req, 'admin');

  if (req.method === 'GET') {
    const db     = getPool();
    const result = await db.query(
      `SELECT id, username, role, created_at FROM users
       WHERE is_active = true AND role = 'manager' ORDER BY created_at ASC`
    );
    res.status(200).json({ users: result.rows }); return;
  }

  if (req.method === 'POST') {
    const { username, password } = req.body || {};
    if (!username || !password) { res.status(400).json({ error: 'username and password required' }); return; }
    if (password.length < 8)    { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }

    const hash = await hashPassword(password);
    const db   = getPool();
    try {
      const result = await db.query(
        `INSERT INTO users (username, password_hash, role)
         VALUES ($1, $2, 'manager') RETURNING id, username, role, created_at`,
        [username.trim().toLowerCase(), hash]
      );
      res.status(201).json({ user: result.rows[0] }); return;
    } catch (err) {
      if (err.code === '23505') { res.status(409).json({ error: 'Username already exists' }); return; }
      throw err;
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
});
