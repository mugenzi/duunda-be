/** @format */

import express from "express";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";

const router = express.Router();

const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
    if (!err) req.user = user;
    next();
  });
};

// GET /api/artists?name=... - Get artist by name (for "About the artist")
router.get("/", optionalAuth, async (req, res) => {
  try {
    const name = req.query.name?.trim();
    if (!name) {
      return res.status(400).json({ message: "Query 'name' is required" });
    }
    const client = getDBClient();
    await client.connect();
    const r = await client.query(
      "SELECT id, name, avatar_url, bio, created_at FROM artists WHERE name = $1",
      [name]
    );
    if (r.rows.length === 0) {
      await client.query("INSERT INTO artists (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
      r = await client.query(
        "SELECT id, name, avatar_url, bio, created_at FROM artists WHERE name = $1",
        [name]
      );
      if (r.rows.length === 0) {
        await client.end();
        return res.json({ id: null, name, avatar_url: null, bio: null, followerCount: 0, isFollowed: false });
      }
    }
    const artist = r.rows[0];
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM artist_follows WHERE artist_id = $1",
      [artist.id]
    );
    let isFollowed = false;
    if (req.user?.userId) {
      const followRow = await client.query(
        "SELECT 1 FROM artist_follows WHERE artist_id = $1 AND user_id = $2",
        [artist.id, req.user.userId]
      );
      isFollowed = followRow.rows.length > 0;
    }
    await client.end();
    return res.json({
      id: artist.id,
      name: artist.name,
      avatar_url: artist.avatar_url,
      bio: artist.bio,
      followerCount: countResult.rows[0].count,
      isFollowed,
    });
  } catch (err) {
    console.error("Error fetching artist:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /api/artists/:id - Get artist by id
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid artist ID" });
    const client = getDBClient();
    await client.connect();
    const r = await client.query(
      "SELECT id, name, avatar_url, bio, created_at FROM artists WHERE id = $1",
      [id]
    );
    if (r.rows.length === 0) {
      await client.end();
      return res.status(404).json({ message: "Artist not found" });
    }
    const artist = r.rows[0];
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM artist_follows WHERE artist_id = $1",
      [id]
    );
    await client.end();
    return res.json({
      ...artist,
      followerCount: countResult.rows[0].count,
    });
  } catch (err) {
    console.error("Error fetching artist:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /api/artists/:id/follow - Follow artist (auth required)
router.post("/:id/follow", authenticateToken, async (req, res) => {
  try {
    const artistId = parseInt(req.params.id, 10);
    if (isNaN(artistId)) return res.status(400).json({ message: "Invalid artist ID" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    const exists = await client.query("SELECT id FROM artists WHERE id = $1", [artistId]);
    if (exists.rows.length === 0) {
      await client.end();
      return res.status(404).json({ message: "Artist not found" });
    }
    await client.query(
      "INSERT INTO artist_follows (user_id, artist_id) VALUES ($1, $2) ON CONFLICT (user_id, artist_id) DO NOTHING",
      [userId, artistId]
    );
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM artist_follows WHERE artist_id = $1",
      [artistId]
    );
    await client.end();
    return res.status(201).json({ artistId, followed: true, followerCount: countResult.rows[0].count });
  } catch (err) {
    console.error("Error following artist:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/artists/:id/follow - Unfollow artist (auth required)
router.delete("/:id/follow", authenticateToken, async (req, res) => {
  try {
    const artistId = parseInt(req.params.id, 10);
    if (isNaN(artistId)) return res.status(400).json({ message: "Invalid artist ID" });
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    await client.query("DELETE FROM artist_follows WHERE user_id = $1 AND artist_id = $2", [userId, artistId]);
    const countResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM artist_follows WHERE artist_id = $1",
      [artistId]
    );
    await client.end();
    return res.json({ artistId, followed: false, followerCount: countResult.rows[0].count });
  } catch (err) {
    console.error("Error unfollowing artist:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
