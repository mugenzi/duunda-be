-- Migration: User roles (listener, artist, administrator)
-- Run after database.sql and database-migration.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'listener';

-- Allowed values: 'listener', 'artist', 'administrator'
-- Artists and administrators have elevated access (upload, etc.)
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- To set a user as artist or admin (run manually as needed):
-- UPDATE users SET role = 'artist' WHERE email = 'artist@example.com';
-- UPDATE users SET role = 'administrator' WHERE email = 'admin@example.com';
