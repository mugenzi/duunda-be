# Radio Broadcast — Research Spike (Backend / Media)

**Branch:** `release/radio-broadcast` (cut from `v1-release`, the current integration branch; `main` is only the initial commit)  
**Date:** 2026-09-07  
**Scope:** Broadcast lifecycle, comments, presence, and Icecast mount + mix. No production routes in this commit.

Companion client spike: `duunda-fe` `docs/RADIO_BROADCAST_SPIKE.md`.

---

## Verdict

Keep Icecast as the **listener fan-out** (free, self-hosted, HTTP audio).

**Do not** ask the React Native host to encode and PUT to Icecast. The app cannot tap `react-native-video`, RN `fetch` cannot stream a PUT body, and there is no dual-platform Icecast source library. See the client spike.

**Recommended v1:** this API owns metadata + session; a mixer process (FFmpeg, optionally Liquidsoap) on the same small instance mixes **catalog track + host mic PCM** and PUTs to Icecast. One mount per live broadcast: `/live/<broadcastId>`.

---

## What already exists

| Area | Current state | Implication |
| --- | --- | --- |
| Style | Express REST, `/api/auth`, `/api/music`, `/api/playlists`, `/api/users` | New router: `/api/broadcasts`. JWT via existing `authenticateToken` pattern (`Authorization: Bearer`). |
| DB | PostgreSQL (`users`, `songs`, `playlists`, …) | New tables below. `snake_case` columns, `SERIAL` PKs, `REFERENCES users(id)`. |
| Auth | JWT `userId` + `username` | Host and listener both require login. |
| Realtime | None | Add `ws` on the same Node process, or short-poll as fallback. |
| Catalog audio | Songs have `audio_url`; files served under `TRACK_BASEPATH` | Mixer can `-i` that HTTP URL. Avoid reading BYTEA in a hot loop. |
| Production FE | Calls `https://assyncs.com/api/...` | Ship these routes on the same host (or a sibling path). Icecast should be a separate hostname/port, e.g. `https://radio.duunda.com`. |

The FE already has song comments (`/api/songs/:id/comments`) that are **not** in this repo’s `database.sql`. Broadcast comments should be a **new** table, not reused song comments.

---

## Recommended data model

```sql
CREATE TABLE IF NOT EXISTS broadcasts (
    id SERIAL PRIMARY KEY,
    host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'live', -- live | ended
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    mount_path VARCHAR(255) NOT NULL,          -- /live/<id>
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

-- Presence can be a table or in-memory Map + WS heartbeat.
CREATE TABLE IF NOT EXISTS broadcast_listeners (
    broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (broadcast_id, user_id)
);
```

Constraints to enforce in API (not only DB):

- One **live** broadcast per host at a time.
- Ending a broadcast is idempotent.
- Comments rejected when `status != 'live'`.

---

## API (REST, matches existing conventions)

All routes under `/api/broadcasts`. Mutations require JWT. List/detail also require JWT (comments + listener identity).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST /` | Start. Body: `{ title }`. Creates row, starts mixer, returns `{ id, title, status, mountPath, listenUrl, startedAt }`. **Do not** return Icecast source password to the mobile client in v1 (client is not the source). |
| `POST /:id/end` | Host only. Stop mixer, mark `ended`, drop WS room, notify listeners. |
| `GET /` | Live broadcasts only. Join host `username` + avatar fields the profile API already exposes. |
| `GET /:id` | Detail for join screen. 404 if missing; include `status` so a just-ended show can show a toast then pop to the hub. |
| `PATCH /:id/track` | Host: `{ trackId }` (nullable to stop music). Mixer switches file. |
| `POST /:id/comments` | `{ text }`. Persist + fan out on WS. |
| `GET /:id/comments` | Pagination (`page`, `limit`) for poll fallback / initial load. |
| `POST /:id/join` / `POST /:id/leave` | Presence + `listener_count`. Also driven by WS connect/disconnect. |

Error shape: `{ message }` like the rest of this API.

---

## Media path (Icecast + FFmpeg)

### Icecast2 (Lightsail/EC2)

- One instance, source password **only on the server**.
- Allow source to create mounts, or pre-declare `/live/*`.
- Public listen: `https://radio.duunda.com/live/<id>` (TLS via nginx/Caddy in front of Icecast 8000).
- On `POST /broadcasts/:id/end`, kick the source (Icecast admin API) so listeners get EOF.

Icecast does **not** need a custom mount-provisioning API if the mixer is the only source client.

### Mixer (preferred: FFmpeg child process)

On start, spawn something equivalent to:

```text
ffmpeg
  -re -i <trackHttpUrl-or-anullsrc>
  -f s16le -ar 44100 -ac 1 -i pipe:mic
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[a]"
  -map "[a]" -c:a libmp3lame -b:a 128k -f mp3
  icecast://source:<pass>@127.0.0.1:8000/live/<id>
```

- Mic PCM arrives on a WebSocket (`/ws/broadcasts/:id/source`) and is written to ffmpeg stdin (or a second pipe).
- Track changes: restart ffmpeg or use a local playlist/concat; simplest v1 is **restart the music input** on `PATCH /:id/track`.
- No mic / mic off: mix silence or music-only.
- Optional ducking: `sidechaincompress` / `loudnorm` later — not blocking.

Liquidsoap (`input.harbor` + `add` + `output.icecast`) is the classic radio stack and is fine if we want harbor instead of a custom WS PCM ingest. FFmpeg fits this Node repo with fewer new moving parts.

### Why not client → Icecast

RN cannot stream a PUT body; no libshout binding; ffmpeg-kit is retired. Server already has the files.

---

## Realtime (comments, count, ended)

**Preferred:** `ws` (one dependency) on the same Express HTTP server.

- `GET /ws/broadcasts/:id?token=...` (or first-message auth) — listeners + host.
- Events: `comment`, `listener_count`, `track_changed`, `broadcast_ended`.
- Host-only socket or path for binary PCM: `/ws/broadcasts/:id/source`.
- Heartbeat; if host source WS dies for N seconds, auto-end.

**Fallback if WS is delayed:** clients `GET /:id` + `GET /:id/comments` every 2–3 seconds. Enough for radio latency. No Firebase/Pusher (cost + new vendor).

---

## Suggested implementation order (this repo)

1. Schema + `/api/broadcasts` CRUD/end/list/detail (no mixer yet; `listenUrl` can be a placeholder).
2. Comments + join/leave + `listener_count`.
3. `ws` room for comments / count / ended.
4. Icecast on the instance + FFmpeg mixer + host source WS.
5. `PATCH /:id/track` wired to the mixer.

Do not merge to `v1-release` until the two-device host/listener test in the feature brief passes.

---

## Out of scope / rejected for v1

- Returning Icecast source credentials to the mobile app
- Per-minute RTC SaaS
- Custom WebRTC SFU
- Mixing inside PostgreSQL / piping BYTEA through Node for every listener
