-- Tester feedback captured from the public /test/feedback page on duunda.com.
-- The page is anonymous (no auth required) so all required fields live in
-- this table directly. Attachments are stored inline as BYTEA, mirroring how
-- audio_files / cover_images / profile_picture_data are already persisted.

CREATE TABLE IF NOT EXISTS tester_feedback (
    id SERIAL PRIMARY KEY,
    firstname VARCHAR(80) NOT NULL,
    lastname VARCHAR(80) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,

    -- Optional single attachment (image, pdf, txt, log, zip)
    attachment_data BYTEA,
    attachment_name VARCHAR(255),
    attachment_size INTEGER,
    attachment_mime VARCHAR(100),

    -- Captured server-side for triage
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_agent TEXT,
    ip_address VARCHAR(64),

    -- Triage workflow ('new' | 'triaged' | 'closed')
    status VARCHAR(20) DEFAULT 'new',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tester_feedback_created_at
    ON tester_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tester_feedback_status
    ON tester_feedback (status);

CREATE INDEX IF NOT EXISTS idx_tester_feedback_email
    ON tester_feedback (email);
