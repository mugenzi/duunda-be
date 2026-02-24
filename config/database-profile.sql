-- Migration: User profile fields (listener-focused profile page)
-- Run after database-roles.sql (or after database-migration.sql)

-- Optional profile fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url VARCHAR(500);

-- firstname, lastname already added in database-migration.sql
-- Index for profile lookups if needed
-- CREATE INDEX IF NOT EXISTS idx_users_profile_picture ON users(profile_picture_url) WHERE profile_picture_url IS NOT NULL;
