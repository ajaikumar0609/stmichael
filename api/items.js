const { getPool } = require('./_lib/db');
const { requireRole } = require('./_lib/auth');
const { withCors } = require('./_lib/handler');

module.exports = withCors(async (req, res) => {
  if (req.method === 'GET') {
    const page = req.query.page;
    if (!page) { res.status(400).json({ error: 'page required' }); return; }

    const db = getPool();
    const params = [page];
    let sql = `SELECT id, page, section, title, subtitle, description,
                      image_url, metadata, display_order, created_at
               FROM content_items WHERE page = $1 AND is_active = true`;
    if (req.query.section) { params.push(req.query.section); sql += ` AND section = $2`; }
    sql += ` ORDER BY display_order ASC, created_at ASC`;

    const result = await db.query(sql, params);
    res.status(200).json({ items: result.rows }); return;
  }

  if (req.method === 'POST') {
    requireRole(req, 'admin', 'manager');
    const { page, section = null, title = null, subtitle = null,
            description = null, image_url = null, metadata = {}, display_order = 0 } = req.body || {};
    if (!page) { res.status(400).json({ error: 'page required' }); return; }

    const db = getPool();
    const result = await db.query(
      `INSERT INTO content_items (page, section, title, subtitle, description, image_url, metadata, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [page, section, title, subtitle, description, image_url, JSON.stringify(metadata), display_order]
    );
    res.status(201).json({ item: result.rows[0] }); return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});
