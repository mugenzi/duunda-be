-- Migration: Song engagement (plays, likes, comments)
-- Run after database.sql and database-migration.sql
-- PostgreSQL syntax

-- Table to track every play of a song
CREATE TABLE IF NOT EXISTS song_plays (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_song_plays_song_id ON song_plays(song_id);
CREATE INDEX IF NOT EXISTS idx_song_plays_user_id ON song_plays(user_id);

-- Table to track song likes (one like per user per song)
CREATE TABLE IF NOT EXISTS song_likes (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_likes_song_id ON song_likes(song_id);
CREATE INDEX IF NOT EXISTS idx_song_likes_user_id ON song_likes(user_id);

-- Table to store song comments
CREATE TABLE IF NOT EXISTS song_comments (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_song_comments_song_id ON song_comments(song_id);
CREATE INDEX IF NOT EXISTS idx_song_comments_user_id ON song_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_song_comments_created_at ON song_comments(created_at);

-- Table to track song dislikes (one per user per song; mutually exclusive with likes)
CREATE TABLE IF NOT EXISTS song_dislikes (
    id SERIAL PRIMARY KEY,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disliked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_dislikes_song_id ON song_dislikes(song_id);
CREATE INDEX IF NOT EXISTS idx_song_dislikes_user_id ON song_dislikes(user_id);
