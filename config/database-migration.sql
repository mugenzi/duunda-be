-- Migration: Add firstname, lastname to users; add password_reset_otps table
-- Run this after the initial database.sql

-- Add firstname and lastname to users (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS firstname VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lastname VARCHAR(100);

-- Backfill: set firstname/lastname from username for existing rows if needed
-- UPDATE users SET firstname = COALESCE(firstname, split_part(username, ' ', 1)), lastname = COALESCE(lastname, split_part(username, ' ', 2)) WHERE firstname IS NULL;

-- Password reset OTPs table
CREATE TABLE IF NOT EXISTS password_reset_otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) NOT NULL,
    otp VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_otps_email ON password_reset_otps(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires ON password_reset_otps(expires_at);
