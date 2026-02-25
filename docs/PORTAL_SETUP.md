# Duunda Web Portal – Artist & Admin

## Overview

- **Login:** `GET /` (root) – branded login form. Email/password → `POST /api/auth/login`. Only users with role `artist` or `administrator` can sign in; others see "Access denied".
- **Dashboard:** `GET /dashboard` – after login, redirects by role:
  - **Admin:** List of all artists with search; click artist → Song & Album Management for that artist.
  - **Artist:** Direct to their own Song & Album Management (no artist list).
- **Artist detail (admin):** `GET /dashboard/artist/:id` – songs for that artist + upload (single, bulk).

All dashboard routes are client-protected: no token → redirect to `/`.

## Database

Run the portal migration so albums and song fields exist:

```bash
# From project root, with DB credentials in .env:
node -e "
require('dotenv').config();
const fs = require('fs');
const pg = require('pg');
const sql = fs.readFileSync('./config/database-portal.sql', 'utf8');
const client = new pg.Client({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'music_app',
  password: process.env.DB_PASSWORD || 'password',
  port: process.env.DB_PORT || 5432,
});
client.connect().then(() => client.query(sql)).then(() => client.end()).then(() => console.log('Portal migration OK'));
"
```

Or run the SQL manually in your DB client:

- `config/database-portal.sql` – adds `role` (if missing), `albums` table, `songs.track_number`, `songs.album_id`.

## API (portal)

- `GET /api/portal/me` – current user + role (Bearer token).
- `GET /api/portal/artists?search=` – admin only; list artists (optional search).
- `GET /api/portal/artists/:id/songs` – songs for artist (admin: any; artist: only own).
- `GET /api/portal/my-artist` – artist profile for logged-in artist (creates one if missing).
- Song upload: existing `POST /api/music/upload` (Bearer token). Cover is optional; `track_number` in body supported.

## Roles

- Set in DB: `UPDATE users SET role = 'artist' WHERE email = '...';` or `role = 'administrator'` for admin.
- Login response and JWT include `role`; dashboard uses it for redirect and visibility.

## Security

- Dashboard routes are HTML; auth is enforced by checking token in localStorage and calling `/api/portal/me`. Invalid/expired token → redirect to `/`.
- For production, consider adding CSRF protection (e.g. same-site cookie + token) and serving the portal over HTTPS.
