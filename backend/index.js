/**
 * St. Michael Group CMS – AWS Lambda Handler
 *
 * Endpoints:
 *   POST   /api/login            – authenticate (username + password), return JWT
 *   GET    /api/items            – fetch active items (?page=X)             [public]
 *   POST   /api/upload-url       – get S3 presigned PUT URL                 [manager+]
 *   POST   /api/items            – insert new content item                  [manager+]
 *   PATCH  /api/items/:id        – update content item                      [manager+]
 *   DELETE /api/items/:id        – soft-delete content item                 [manager+]
 *   GET    /api/users            – list managers                            [admin]
 *   POST   /api/users            – create manager account                   [admin]
 *   DELETE /api/users/:id        – deactivate user                          [admin]
 *
 * Environment variables:
 *   ADMIN_PASSWORD  – initial admin password (used to seed first admin on cold start)
 *   ADMIN_USERNAME  – initial admin username (default: "admin")
 *   JWT_SECRET      – random 32+ char string
 *   DB_HOST / DB_USER / DB_PASS / DB_NAME
 *   S3_BUCKET / AWS_REGION
 */

'use strict';

const { Pool }                 = require('pg');
const jwt                      = require('jsonwebtoken');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl }         = require('@aws-sdk/s3-request-presigner');
const { randomUUID, scrypt, randomBytes, timingSafeEqual } = require('crypto');
const { promisify }            = require('util');

const scryptAsync = promisify(scrypt);

// ── Password hashing (scrypt — built-in Node crypto, no extra deps) ───────────
async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const key  = await scryptAsync(plain, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(plain, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scryptAsync(plain, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), key);
}

// ── DB pool ───────────────────────────────────────────────────────────────────
let pool;
function getPool() {
  if (!pool) {
    pool = new Pool({
      host:              process.env.DB_HOST,
      user:              process.env.DB_USER,
      password:          process.env.DB_PASS,
      database:          process.env.DB_NAME,
      port:              5432,
      ssl:               { rejectUnauthorized: false },
      max:               5,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

// ── Seed admin on first deploy ────────────────────────────────────────────────
let adminSeeded = false;
async function ensureAdminExists() {
  if (adminSeeded) return;
  adminSeeded = true;
  const db = getPool();
  const { rowCount } = await db.query(`SELECT 1 FROM users WHERE is_active = true LIMIT 1`);
  if (rowCount === 0 && process.env.ADMIN_PASSWORD) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const hash     = await hashPassword(process.env.ADMIN_PASSWORD);
    await db.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (username) DO NOTHING`,
      [username, hash]
    );
  }
}

// ── S3 client ─────────────────────────────────────────────────────────────────
const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getTokenPayload(event) {
  const auth  = (event.headers || {})['authorization'] || (event.headers || {})['Authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('No token');
  return jwt.verify(token, process.env.JWT_SECRET);
}

function requireRole(event, ...allowedRoles) {
  const payload = getTokenPayload(event);
  if (!allowedRoles.includes(payload.role)) {
    const err = new Error('Forbidden'); err.status = 403; throw err;
  }
  return payload;
}

// ── Router ────────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const method  = event.requestContext?.http?.method || event.httpMethod || 'GET';
  const rawPath = event.requestContext?.http?.path   || event.path       || '/';

  if (method === 'OPTIONS') return respond(204, '');

  try {
    await ensureAdminExists();

    // ── Auth ──
    if (method === 'POST' && rawPath === '/api/login')
      return handleLogin(event);

    // ── Content (manager + admin) ──
    if (method === 'GET'  && rawPath === '/api/items')
      return handleGetItems(event);

    if (method === 'POST' && rawPath === '/api/upload-url') {
      requireRole(event, 'admin', 'manager');
      return handleUploadUrl(event);
    }
    if (method === 'POST' && rawPath === '/api/items') {
      requireRole(event, 'admin', 'manager');
      return handleCreateItem(event);
    }
    if (method === 'PATCH' && rawPath.startsWith('/api/items/')) {
      requireRole(event, 'admin', 'manager');
      return handleUpdateItem(rawPath.split('/api/items/')[1], event);
    }
    if (method === 'DELETE' && rawPath.startsWith('/api/items/')) {
      requireRole(event, 'admin', 'manager');
      return handleDeleteItem(rawPath.split('/api/items/')[1]);
    }

    // ── User management (admin only) ──
    if (method === 'GET'    && rawPath === '/api/users') {
      requireRole(event, 'admin');
      return handleGetUsers();
    }
    if (method === 'POST'   && rawPath === '/api/users') {
      requireRole(event, 'admin');
      return handleCreateUser(event);
    }
    if (method === 'DELETE' && rawPath.startsWith('/api/users/')) {
      requireRole(event, 'admin');
      return handleDeleteUser(rawPath.split('/api/users/')[1]);
    }

    return respond(404, { error: 'Not found' });

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.message === 'No token')
      return respond(401, { error: 'Unauthorized' });
    if (err.status === 403)
      return respond(403, { error: 'Forbidden — insufficient role' });
    console.error(err);
    return respond(500, { error: 'Internal server error' });
  }
};

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleLogin(event) {
  const { username, password } = JSON.parse(event.body || '{}');
  if (!username || !password) return respond(400, { error: 'username and password required' });

  const db = getPool();
  const { rows } = await db.query(
    `SELECT id, username, password_hash, role FROM users WHERE username = $1 AND is_active = true`,
    [username.trim().toLowerCase()]
  );

  if (!rows.length) return respond(401, { error: 'Invalid credentials' });
  const user = rows[0];

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return respond(401, { error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return respond(200, { token, role: user.role, username: user.username });
}

async function handleGetItems(event) {
  const qs      = event.queryStringParameters || {};
  const { page, section } = qs;
  if (!page) return respond(400, { error: 'page query param required' });

  const db     = getPool();
  const params = [page];
  let sql = `
    SELECT id, page, section, title, subtitle, description,
           image_url, metadata, display_order, created_at
    FROM content_items
    WHERE page = $1 AND is_active = true
  `;
  if (section) { params.push(section); sql += ` AND section = $2`; }
  sql += ` ORDER BY display_order ASC, created_at ASC`;

  const result = await db.query(sql, params);
  return respond(200, { items: result.rows });
}

async function handleUploadUrl(event) {
  const { filename, contentType } = JSON.parse(event.body || '{}');
  if (!filename || !contentType) return respond(400, { error: 'filename and contentType required' });

  const ext     = filename.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  const key     = `uploads/${randomUUID()}.${ext}`;
  const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  const imageUrl  = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;

  return respond(200, { uploadUrl, imageUrl });
}

async function handleCreateItem(event) {
  const { page, section = null, title = null, subtitle = null,
          description = null, image_url = null, metadata = {}, display_order = 0 }
    = JSON.parse(event.body || '{}');

  if (!page) return respond(400, { error: 'page is required' });

  const db     = getPool();
  const result = await db.query(
    `INSERT INTO content_items (page,section,title,subtitle,description,image_url,metadata,display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [page, section, title, subtitle, description, image_url, JSON.stringify(metadata), display_order]
  );
  return respond(201, { item: result.rows[0] });
}

async function handleUpdateItem(id, event) {
  if (!id) return respond(400, { error: 'id required' });

  const body   = JSON.parse(event.body || '{}');
  const fields = [], params = [];
  let idx = 1;

  for (const col of ['title','subtitle','description','image_url','metadata','display_order']) {
    if (col in body) {
      fields.push(`${col} = $${idx++}`);
      params.push(col === 'metadata' ? JSON.stringify(body[col]) : body[col]);
    }
  }
  if (!fields.length) return respond(400, { error: 'Nothing to update' });

  params.push(id);
  const db     = getPool();
  const result = await db.query(
    `UPDATE content_items SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`,
    params
  );
  if (result.rowCount === 0) return respond(404, { error: 'Item not found' });
  return respond(200, { item: result.rows[0] });
}

async function handleDeleteItem(id) {
  if (!id) return respond(400, { error: 'id required' });
  const db     = getPool();
  const result = await db.query(
    `UPDATE content_items SET is_active = false WHERE id = $1 RETURNING id`, [id]
  );
  if (result.rowCount === 0) return respond(404, { error: 'Item not found' });
  return respond(200, { deleted: id });
}

// ── User management ───────────────────────────────────────────────────────────

async function handleGetUsers() {
  const db     = getPool();
  const result = await db.query(
    `SELECT id, username, role, created_at FROM users WHERE is_active = true AND role = 'manager' ORDER BY created_at ASC`
  );
  return respond(200, { users: result.rows });
}

async function handleCreateUser(event) {
  const { username, password } = JSON.parse(event.body || '{}');
  if (!username || !password) return respond(400, { error: 'username and password required' });
  if (password.length < 8)    return respond(400, { error: 'Password must be at least 8 characters' });

  const hash = await hashPassword(password);
  const db   = getPool();

  try {
    const result = await db.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'manager') RETURNING id, username, role, created_at`,
      [username.trim().toLowerCase(), hash]
    );
    return respond(201, { user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return respond(409, { error: 'Username already exists' });
    throw err;
  }
}

async function handleDeleteUser(id) {
  if (!id) return respond(400, { error: 'id required' });
  const db     = getPool();
  const result = await db.query(
    `UPDATE users SET is_active = false WHERE id = $1 AND role = 'manager' RETURNING id`, [id]
  );
  if (result.rowCount === 0) return respond(404, { error: 'User not found' });
  return respond(200, { deleted: id });
}
