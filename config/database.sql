-- Database schema for Duunda Music App
-- Run this script in PostgreSQL to create the required tables

-- Create database (run this separately as superuser)
-- CREATE DATABASE music_app;

-- Connect to the music_app database and run the following:

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audio files table
CREATE TABLE IF NOT EXISTS audio_files (
    id SERIAL PRIMARY KEY,
    file_data BYTEA NOT NULL, -- binary audio data
    file_name VARCHAR(255) NOT NULL, -- original filename
    file_size INTEGER NOT NULL, -- file size in bytes
    mime_type VARCHAR(100) NOT NULL, -- audio/mpeg, audio/wav, etc.
    uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cover images table
CREATE TABLE IF NOT EXISTS cover_images (
    id SERIAL PRIMARY KEY,
    image_data BYTEA NOT NULL, -- binary image data
    file_name VARCHAR(255) NOT NULL, -- original filename
    file_size INTEGER NOT NULL, -- file size in bytes
    mime_type VARCHAR(100) NOT NULL, -- image/jpeg, image/png, etc.
    uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    album VARCHAR(255),
    genre VARCHAR(100),
    duration INTEGER, -- duration in seconds
    audio_url VARCHAR(500) NOT NULL, -- URL to access audio file
    cover_url VARCHAR(500), -- URL to access cover image
    uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Playlist songs junction table
CREATE TABLE IF NOT EXISTS playlist_songs (
    id SERIAL PRIMARY KEY,
    playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
    song_id INTEGER REFERENCES songs(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(playlist_id, song_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);
CREATE INDEX IF NOT EXISTS idx_songs_genre ON songs(genre);
CREATE INDEX IF NOT EXISTS idx_songs_uploaded_by ON songs(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_song_id ON playlist_songs(song_id);

-- Insert some sample data (optional)
INSERT INTO users (username, email, password_hash) VALUES 
('demo_user', 'demo@example.com', 'duunda@123')
ON CONFLICT (email) DO NOTHING;

-- Create uploads directory function (for reference)
-- You'll need to create the uploads directory manually: mkdir uploads
