/** @format */

import express from "express";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";

const router = express.Router();

// Optional auth: attach req.user if valid token present
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

// Ensure song exists
async function ensureSongExists(client, songId) {
  const r = await client.query("SELECT id FROM songs WHERE id = $1", [songId]);
  if (r.rows.length === 0) return false;
  return true;
}

// POST /api/songs/:songId/play - Record a play (optional auth)
router.post("/:songId/play", optionalAuth, async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const userId = req.user?.userId ?? null;
    await client.query(
      "INSERT INTO song_plays (song_id, user_id, played_at) VALUES ($1, $2, NOW())",
      [songId, userId]
    );
    await client.end();
    return res.status(201).json({ songId, recorded: true });
  } catch (err) {
    console.error("Error recording play:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/songs/:songId/plays/count
router.get("/:songId/plays/count", async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const r = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_plays WHERE song_id = $1",
      [songId]
    );
    await client.end();
    return res.json({
      songId,
      playCount: r.rows[0].count,
    });
  } catch (err) {
    console.error("Error fetching play count:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/songs/:songId/like - Like a song (auth required)
router.post("/:songId/like", authenticateToken, async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    await client.query(
      "INSERT INTO song_likes (song_id, user_id) VALUES ($1, $2) ON CONFLICT (user_id, song_id) DO NOTHING",
      [songId, userId]
    );
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_likes WHERE song_id = $1",
      [songId]
    );
    await client.end();
    return res.status(201).json({
      songId,
      userId,
      liked: true,
      likeCount: countResult.rows[0].count,
    });
  } catch (err) {
    console.error("Error liking song:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/songs/:songId/like - Unlike (auth required)
router.delete("/:songId/like", authenticateToken, async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    const result = await client.query(
      "DELETE FROM song_likes WHERE song_id = $1 AND user_id = $2 RETURNING id",
      [songId, userId]
    );
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_likes WHERE song_id = $1",
      [songId]
    );
    await client.end();
    return res.json({
      songId,
      userId,
      liked: false,
      likeCount: countResult.rows[0].count,
    });
  } catch (err) {
    console.error("Error unliking song:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/songs/:songId/likes/count
router.get("/:songId/likes/count", async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const r = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_likes WHERE song_id = $1",
      [songId]
    );
    await client.end();
    return res.json({ songId, likeCount: r.rows[0].count });
  } catch (err) {
    console.error("Error fetching like count:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/songs/:songId/likes/status - Check if current user liked (auth required)
router.get("/:songId/likes/status", authenticateToken, async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const r = await client.query(
      "SELECT 1 FROM song_likes WHERE song_id = $1 AND user_id = $2",
      [songId, userId]
    );
    await client.end();
    return res.json({
      songId,
      userId,
      isLiked: r.rows.length > 0,
    });
  } catch (err) {
    console.error("Error fetching like status:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/songs/:songId/comments - List comments (newest first)
router.get("/:songId/comments", async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const r = await client.query(
      `SELECT c.id, c.user_id AS "userId", u.username, c.comment_text AS "commentText", c.created_at AS "createdAt"
       FROM song_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.song_id = $1
       ORDER BY c.created_at DESC`,
      [songId]
    );
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_comments WHERE song_id = $1",
      [songId]
    );
    await client.end();
    const comments = r.rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      username: row.username,
      commentText: row.commentText,
      createdAt: row.createdAt,
    }));
    return res.json({
      songId,
      totalComments: countResult.rows[0].count,
      comments,
    });
  } catch (err) {
    console.error("Error fetching comments:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/songs/:songId/comments - Add comment (auth required)
router.post("/:songId/comments", authenticateToken, async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const { commentText } = req.body;
    if (!commentText || typeof commentText !== "string") {
      return res.status(400).json({ message: "commentText is required" });
    }
    const trimmed = commentText.trim();
    if (trimmed.length === 0)
      return res.status(400).json({ message: "Comment cannot be empty" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const userRow = await client.query(
      "SELECT username FROM users WHERE id = $1",
      [userId]
    );
    const username = userRow.rows[0]?.username || "user";
    const insert = await client.query(
      `INSERT INTO song_comments (song_id, user_id, comment_text) VALUES ($1, $2, $3)
       RETURNING id, user_id AS "userId", comment_text AS "commentText", created_at AS "createdAt"`,
      [songId, userId, trimmed]
    );
    await client.end();
    const row = insert.rows[0];
    return res.status(201).json({
      id: row.id,
      songId,
      userId: row.userId,
      username,
      commentText: row.commentText,
      createdAt: row.createdAt,
    });
  } catch (err) {
    console.error("Error adding comment:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/songs/:songId/comments/count
router.get("/:songId/comments/count", async (req, res) => {
  try {
    const songId = parseInt(req.params.songId, 10);
    if (isNaN(songId))
      return res.status(400).json({ message: "Invalid song ID" });
    const client = getDBClient();
    await client.connect();
    const exists = await ensureSongExists(client, songId);
    if (!exists) {
      await client.end();
      return res.status(404).json({ message: "Song not found" });
    }
    const r = await client.query(
      "SELECT COUNT(*)::int AS count FROM song_comments WHERE song_id = $1",
      [songId]
    );
    await client.end();
    return res.json({ songId, commentCount: r.rows[0].count });
  } catch (err) {
    console.error("Error fetching comment count:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
