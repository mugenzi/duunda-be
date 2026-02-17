-- Migration: Artists and follow feature
-- Run after database.sql and database-engagement.sql
-- PostgreSQL syntax

-- Artists table (artist accounts for "About the artist" and follow)
CREATE TABLE IF NOT EXISTS artists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    avatar_url VARCHAR(500),
    bio TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_artists_name ON artists(name);
CREATE INDEX IF NOT EXISTS idx_artists_user_id ON artists(user_id);

-- User follows artist (one row per user per artist)
CREATE TABLE IF NOT EXISTS artist_follows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_follows_artist_id ON artist_follows(artist_id);

-- Optional: link songs to artist (run after backfilling artists by name)
ALTER TABLE songs ADD COLUMN IF NOT EXISTS artist_id INTEGER REFERENCES artists(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_songs_artist_id ON songs(artist_id);
