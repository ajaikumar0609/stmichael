const { getPool } = require('../_lib/db');
const { requireRole } = require('../_lib/auth');
const { withCors } = require('../_lib/handler');

module.exports = withCors(async (req, res) => {
  const id = req.query.id;

  if (req.method === 'PATCH') {
    requireRole(req, 'admin', 'manager');
    const body   = req.body || {};
    const fields = [], params = [];
    let idx = 1;
    for (const col of ['title', 'subtitle', 'description', 'image_url', 'metadata', 'display_order']) {
      if (col in body) {
        fields.push(`${col} = $${idx++}`);
        params.push(col === 'metadata' ? JSON.stringify(body[col]) : body[col]);
      }
    }
    if (!fields.length) { res.status(400).json({ error: 'Nothing to update' }); return; }
    params.push(id);
    const db     = getPool();
    const result = await db.query(
      `UPDATE content_items SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`,
      params
    );
    if (result.rowCount === 0) { res.status(404).json({ error: 'Item not found' }); return; }
    res.status(200).json({ item: result.rows[0] }); return;
  }

  if (req.method === 'DELETE') {
    requireRole(req, 'admin', 'manager');
    const db     = getPool();
    const result = await db.query(
      'UPDATE content_items SET is_active = false WHERE id = $1 RETURNING id', [id]
    );
    if (result.rowCount === 0) { res.status(404).json({ error: 'Item not found' }); return; }
    res.status(200).json({ deleted: id }); return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
