const { getPool }    = require('../_lib/db');
const { requireRole } = require('../_lib/auth');
const { withCors }   = require('../_lib/handler');

module.exports = withCors(async (req, res) => {
  requireRole(req, 'admin');

  if (req.method === 'DELETE') {
    const id     = req.query.id;
    const db     = getPool();
    const result = await db.query(
      `UPDATE users SET is_active = false WHERE id = $1 AND role = 'manager' RETURNING id`, [id]
    );
    if (result.rowCount === 0) { res.status(404).json({ error: 'User not found' }); return; }
    res.status(200).json({ deleted: id }); return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
