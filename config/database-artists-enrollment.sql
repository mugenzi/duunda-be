-- Migration: Artist enrollment fields (firstname, lastname, middle_name, carrier_name)
-- Run after database-artists.sql. Replaces artists.name with carrier_name and adds personal name fields.
-- Also ensures user_id exists (in case artists was created without it).

-- Ensure user_id exists (link to users table)
ALTER TABLE artists ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id);

-- Add new columns
ALTER TABLE artists ADD COLUMN IF NOT EXISTS firstname VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS lastname VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS middle_name VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS carrier_name VARCHAR(255);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);
ALTER TABLE artists ADD COLUMN IF NOT EXISTS bio TEXT;

-- Backfill carrier_name from name if name column exists (for existing data)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artists' AND column_name = 'name'
  ) THEN
    UPDATE artists SET carrier_name = name WHERE carrier_name IS NULL AND name IS NOT NULL;
    ALTER TABLE artists DROP COLUMN name;
  END IF;
END $$;

-- Indexes: drop old name index, add carrier_name index and unique constraint
DROP INDEX IF EXISTS idx_artists_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_carrier_name ON artists(carrier_name) WHERE carrier_name IS NOT NULL;

-- Allow NULL in passkey so signup/portal inserts don't require it (column may exist in your DB)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artists' AND column_name = 'passkey'
  ) THEN
    ALTER TABLE artists ALTER COLUMN passkey DROP NOT NULL;
  END IF;
END $$;
