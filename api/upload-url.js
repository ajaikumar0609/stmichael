const { randomUUID } = require('crypto');
const { requireRole } = require('./_lib/auth');
const { withCors }   = require('./_lib/handler');

module.exports = withCors(async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  requireRole(req, 'admin', 'manager');

  const { filename, contentType } = req.body || {};
  if (!filename || !contentType) { res.status(400).json({ error: 'filename and contentType required' }); return; }

  const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const bucket      = (process.env.SUPABASE_BUCKET || 'images').trim();

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Supabase env vars not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)' }); return;
  }

  const ext = (filename.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `uploads/${randomUUID()}.${ext}`;
  const signEndpoint = `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${key}`;

  console.log('Supabase sign endpoint:', signEndpoint);
  console.log('Bucket:', bucket);

  const signRes = await fetch(signEndpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ upsert: true }),
  });

  if (!signRes.ok) {
    const err = await signRes.text();
    console.error('Supabase sign error:', signRes.status, err);
    res.status(500).json({ error: `Supabase sign error ${signRes.status}: ${err}` }); return;
  }

  const signData = await signRes.json();
  console.log('Supabase sign response:', JSON.stringify(signData));

  // Supabase returns { signedURL: "/storage/v1/object/upload/sign?token=..." }
  const signedURL  = signData.signedURL || signData.signedUrl || signData.url || '';
  if (!signedURL) {
    res.status(500).json({ error: `Supabase returned no signed URL. Response: ${JSON.stringify(signData)}` }); return;
  }
  const uploadUrl  = signedURL.startsWith('http') ? signedURL : `${supabaseUrl}${signedURL}`;
  const imageUrl   = `${supabaseUrl}/storage/v1/object/public/${bucket}/${key}`;

  res.status(200).json({ uploadUrl, imageUrl });
});
