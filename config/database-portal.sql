-- Migration: Portal – albums and song fields for web management
-- Run after database.sql, database-roles.sql, database-artists.sql
-- Ensures role column exists and adds albums + track_number for portal uploads

-- User role (if not already applied from database-roles.sql)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'listener';

-- Albums table (for album upload flow)
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

-- Song columns for portal (track number, optional link to album)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS track_number INTEGER;
ALTER TABLE songs ADD COLUMN IF NOT EXISTS album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_songs_album_id ON songs(album_id);
