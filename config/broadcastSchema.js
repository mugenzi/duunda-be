/** @format */

const BROADCAST_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS broadcasts (
    id SERIAL PRIMARY KEY,
    host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'live',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    mount_path VARCHAR(255) NOT NULL,
    listen_url VARCHAR(500) NOT NULL,
    current_track_id INTEGER REFERENCES songs(id) ON DELETE SET NULL,
    listener_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_host ON broadcasts(host_user_id);

CREATE TABLE IF NOT EXISTS broadcast_comments (
    id SERIAL PRIMARY KEY,
    broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_broadcast_comments_broadcast
    ON broadcast_comments(broadcast_id, created_at);

CREATE TABLE IF NOT EXISTS broadcast_listeners (
    broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (broadcast_id, user_id)
);
`;

export async function ensureBroadcastTables(client) {
  await client.query(BROADCAST_TABLES_SQL);
}
