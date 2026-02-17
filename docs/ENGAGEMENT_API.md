# Song Engagement API

Base path: `/api/songs`

All routes use `:songId` as the song ID (integer). Authenticated endpoints require header: `Authorization: Bearer <token>`.

---

## Play count

### POST `/api/songs/:songId/play`
Record a play for the song. Optional auth (if token present, `user_id` is stored). Returns updated `playCount` so clients can update UI.

**Response** `201`:
```json
{ "songId": 123, "recorded": true, "playCount": 1548 }
```

### GET `/api/songs/:songId/plays/count`
Get total play count for a song.

**Response** `200`:
```json
{ "songId": 123, "playCount": 1547 }
```

---

## Likes

### POST `/api/songs/:songId/like`
Like a song (current user). **Auth required.** Idempotent (duplicate like returns success).

**Response** `201`:
```json
{ "songId": 123, "userId": 456, "liked": true, "likeCount": 845 }
```

### DELETE `/api/songs/:songId/like`
Remove like. **Auth required.**

**Response** `200`:
```json
{ "songId": 123, "userId": 456, "liked": false, "likeCount": 844 }
```

### GET `/api/songs/:songId/likes/count`
Get total like count.

**Response** `200`:
```json
{ "songId": 123, "likeCount": 845 }
```

### GET `/api/songs/:songId/likes/status`
Check if current user has liked the song. **Auth required.**

**Response** `200`:
```json
{ "songId": 123, "userId": 456, "isLiked": true }
```

---

## Dislikes (mutually exclusive with likes)

### POST `/api/songs/:songId/dislike`
Dislike a song (current user). **Auth required.** Removes like if present.

**Response** `201`:
```json
{ "songId": 123, "userId": 456, "disliked": true, "likeCount": 844, "dislikeCount": 16 }
```

### DELETE `/api/songs/:songId/dislike`
Remove dislike. **Auth required.**

**Response** `200`:
```json
{ "songId": 123, "userId": 456, "disliked": false, "likeCount": 844, "dislikeCount": 15 }
```

### GET `/api/songs/:songId/dislikes/count`
Get total dislike count.

**Response** `200`:
```json
{ "songId": 123, "dislikeCount": 15000 }
```

---

## Engagement status (combined)

### GET `/api/songs/:songId/engagement/status`
Get like/dislike/comment/play counts and current user's like/dislike status. **Auth optional** (if token present, `isLiked` and `isDisliked` are returned).

**Response** `200`:
```json
{
  "songId": 123,
  "userId": 456,
  "isLiked": true,
  "isDisliked": false,
  "likeCount": 708000,
  "dislikeCount": 15000,
  "commentCount": 23,
  "playCount": 1200
}
```

---

## Comments

### GET `/api/songs/:songId/comments`
Get all comments for a song (newest first).

**Response** `200`:
```json
{
  "songId": 123,
  "totalComments": 23,
  "comments": [
    {
      "id": 1,
      "userId": 456,
      "username": "john_doe",
      "commentText": "Great song!",
      "createdAt": "2025-02-16T10:30:00Z"
    }
  ]
}
```

### POST `/api/songs/:songId/comments`
Add a comment. **Auth required.**

**Body**:
```json
{ "commentText": "This is my new favorite song!" }
```

**Response** `201`:
```json
{
  "id": 24,
  "songId": 123,
  "userId": 456,
  "username": "john_doe",
  "commentText": "This is my new favorite song!",
  "createdAt": "2025-02-16T15:45:00Z"
}
```

### GET `/api/songs/:songId/comments/count`
Get total comment count.

**Response** `200`:
```json
{ "songId": 123, "commentCount": 23 }
```

---

## Errors

- `400` – Invalid `songId` or invalid body (e.g. empty comment).
- `401` – Missing or invalid token (for auth-required routes).
- `404` – Song not found.
- `500` – Server error.

---

## Database schema (engagement)

See `config/database-engagement.sql` for full DDL. Summary:

- **song_plays** – `song_id`, `user_id` (nullable), `played_at`
- **song_likes** – `song_id`, `user_id`, unique `(user_id, song_id)`
- **song_dislikes** – `song_id`, `user_id`, unique `(user_id, song_id)` (mutually exclusive with likes in app logic)
- **song_comments** – `song_id`, `user_id`, `comment_text`, `created_at`, `updated_at`

Run the migration after the main schema and `database-migration.sql`:

```bash
psql -U postgres -d music_app -f config/database-engagement.sql
```
