-- Migration: Songs relationships with artists and albums
-- Run after database-artists.sql and database-portal.sql (or after database.sql for a minimal run)
-- Ensures songs has artist_id (FK to artists) and album_id (FK to albums). Album is NULL for singles.

-- Ensure albums table exists (from portal)
CREATE TABLE IF NOT EXISTS albums (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    release_date DATE,
    genre VARCHAR(100),
    cover_url VARCHAR(500),
    uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_albums_uploaded_by ON albums(uploaded_by);

-- Songs: link to artist (required for "who owns this song"). Nullable for legacy rows.
ALTER TABLE songs ADD COLUMN IF NOT EXISTS artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);

-- Songs: link to album (NULL for singles)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);

-- Optional: track_number for ordering within an album
ALTER TABLE songs ADD COLUMN IF NOT EXISTS track_number INTEGER;
