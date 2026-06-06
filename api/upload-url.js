const { randomUUID } = require('crypto');
const { requireRole } = require('./_lib/auth');
const { withCors }   = require('./_lib/handler');

module.exports = withCors(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  requireRole(req, 'admin', 'manager');

  const { filename, contentType } = req.body || {};
  if (!filename || !contentType) { res.status(400).json({ error: 'filename and contentType required' }); return; }

  const ext = filename.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `uploads/${randomUUID()}.${ext}`;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const bucket      = process.env.SUPABASE_BUCKET || 'images';

  // Generate a Supabase Storage upload URL via signed upload
  const signRes = await fetch(
    `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${key}`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ upsert: false }),
    }
  );

  if (!signRes.ok) {
    const err = await signRes.text();
    console.error('Supabase sign error:', err);
    res.status(500).json({ error: 'Failed to generate upload URL' }); return;
  }

  const { signedURL } = await signRes.json();
  const uploadUrl = `${supabaseUrl}/storage/v1${signedURL}`;
  const imageUrl  = `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;

  res.status(200).json({ uploadUrl, imageUrl });
});
