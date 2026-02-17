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

const requireArtistOrAdmin = (req, res, next) => {
  const role = req.user?.role || "listener";
  if (role !== "artist" && role !== "administrator") {
    return res.status(403).json({ message: "Artist or administrator access required" });
  }
  next();
};

// GET /api/artists/me - Get logged-in artist profile (artist or admin only)
router.get("/me", authenticateToken, requireArtistOrAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    const client = getDBClient();
    await client.connect();
    let r = await client.query(
      "SELECT id, name, avatar_url, bio, user_id, created_at FROM artists WHERE user_id = $1",
      [userId]
    );
    if (r.rows.length === 0) {
      const name = req.user.username || `User ${userId}`;
      await client.query("INSERT INTO artists (name, user_id) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [name, userId]);
      r = await client.query(
        "SELECT id, name, avatar_url, bio, user_id, created_at FROM artists WHERE user_id = $1",
        [userId]
      );
      if (r.rows.length === 0) {
        const byName = await client.query("SELECT id, name, avatar_url, bio, user_id, created_at FROM artists WHERE name = $1", [name]);
        if (byName.rows.length > 0) {
          await client.query("UPDATE artists SET user_id = $1 WHERE id = $2", [userId, byName.rows[0].id]);
          r = byName;
        }
      }
    }
    await client.end();
    if (r.rows.length === 0) return res.status(404).json({ message: "Artist profile not found" });
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("Error fetching artist me:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/artists/me - Update logged-in artist profile (name, bio, avatar_url)
router.patch("/me", authenticateToken, requireArtistOrAdmin, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, bio, avatar_url } = req.body;
    const client = getDBClient();
    await client.connect();
    let r = await client.query("SELECT id FROM artists WHERE user_id = $1", [userId]);
    if (r.rows.length === 0) {
      await client.end();
      return res.status(404).json({ message: "Artist profile not found. Use GET /me first." });
    }
    const artistId = r.rows[0].id;
    const updates = [];
    const values = [];
    let i = 1;
    if (name !== undefined) {
      updates.push(`name = $${i++}`);
      values.push(name);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${i++}`);
      values.push(bio);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${i++}`);
      values.push(avatar_url);
    }
    if (updates.length === 0) {
      await client.end();
      return res.json({ message: "No updates" });
    }
    values.push(artistId);
    await client.query(
      `UPDATE artists SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${i}`,
      values
    );
    r = await client.query("SELECT id, name, avatar_url, bio, user_id, updated_at FROM artists WHERE id = $1", [artistId]);
    await client.end();
    return res.json(r.rows[0]);
  } catch (err) {
    console.error("Error updating artist me:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

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
