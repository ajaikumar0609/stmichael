-- Run this once in your RDS PostgreSQL database

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (admin + managers)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- scrypt: "salt:hash"
  role          TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('admin','manager')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Content items table
CREATE TABLE IF NOT EXISTS content_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page          TEXT NOT NULL,
  section       TEXT,
  title         TEXT,
  subtitle      TEXT,
  description   TEXT,
  image_url     TEXT,
  metadata      JSONB DEFAULT '{}',
  display_order INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_items_page
  ON content_items(page, is_active, display_order);

-- NOTE: The first admin user is auto-created by the Lambda on cold start
-- using the ADMIN_PASSWORD and ADMIN_USERNAME environment variables.
-- No manual INSERT needed here.
