const { randomUUID } = require('crypto');
const { requireRole } = require('./_lib/auth');
const { withCors }   = require('./_lib/handler');

const handler = withCors(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  requireRole(req, 'admin', 'manager');

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const bucket      = (process.env.SUPABASE_BUCKET || 'images').trim();

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase env vars not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)' }); return;
  }

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const filename    = req.headers['x-filename'] || 'upload';
  const ext         = (filename.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key         = `uploads/${randomUUID()}.${ext}`;

  // Read raw binary body from request stream
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);

  const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${key}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${serviceKey}`,
      apikey:         serviceKey,
      'Content-Type': contentType,
      'x-upsert':     'true',
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    console.error('Supabase upload error:', uploadRes.status, err);
    res.status(500).json({ error: `Upload failed (${uploadRes.status}): ${err}` }); return;
  }

  const imageUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;
  res.status(200).json({ imageUrl });
});

handler.config = { api: { bodyParser: false } };
module.exports = handler;
