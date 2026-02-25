/** @format – Web portal API: artist list (admin), songs by artist, auth check */

import express from "express";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";

const router = express.Router();

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "administrator") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

const requireArtistOrAdmin = (req, res, next) => {
  const role = req.user?.role || "listener";
  if (role !== "artist" && role !== "administrator") {
    return res.status(403).json({ message: "Artist or admin access required" });
  }
  next();
};

// GET /api/portal/me – current user + role (for dashboard)
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.userId,
      username: req.user.username,
      role: req.user.role || "listener",
    },
  });
});

// GET /api/portal/artists – admin only, list all artists with optional search
router.get("/artists", authenticateToken, requireAdmin, async (req, res) => {
  const client = getDBClient();
  try {
    await client.connect();
    const search = (req.query.search || "").trim();
    let query =
      "SELECT a.id, a.carrier_name, a.firstname, a.lastname, a.middle_name, a.user_id, u.email FROM artists a LEFT JOIN users u ON a.user_id = u.id WHERE 1=1";
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (a.carrier_name ILIKE $${params.length} OR a.firstname ILIKE $${params.length} OR a.lastname ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    query += " ORDER BY a.carrier_name";
    const r = await client.query(query, params);
    res.json({ artists: r.rows });
  } catch (err) {
    console.error("Portal artists list:", err);
    const msg =
      err.code === "42P01"
        ? "Artists table not found. Run config/database-artists.sql migration."
        : err.message || "Server error";
    res.status(500).json({ message: msg });
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
});

// GET /api/portal/artists/:id/songs – songs for artist (admin: any, artist: only own)
router.get("/artists/:id/songs", authenticateToken, requireArtistOrAdmin, async (req, res) => {
  const artistId = parseInt(req.params.id, 10);
  if (isNaN(artistId)) return res.status(400).json({ message: "Invalid artist ID" });
  const client = getDBClient();
  try {
    await client.connect();
    const artist = await client.query("SELECT id, user_id FROM artists WHERE id = $1", [artistId]);
    if (artist.rows.length === 0) {
      return res.status(404).json({ message: "Artist not found" });
    }
    const artistUserId = artist.rows[0].user_id;
    if (req.user.role !== "administrator" && req.user.userId !== artistUserId) {
      return res.status(403).json({ message: "Not allowed to view this artist's songs" });
    }
    const songs = await client.query(
      `SELECT id, title, artist, album, genre, duration, audio_url, cover_url, uploaded_by, created_at, track_number, artist_id, album_id
       FROM songs WHERE uploaded_by = $1 ORDER BY created_at DESC`,
      [artistUserId]
    );
    res.json({ songs: songs.rows });
  } catch (err) {
    console.error("Portal artist songs:", err);
    res.status(500).json({ message: err.message || "Server error" });
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
});

// GET /api/portal/my-artist – artist profile for logged-in artist (for dashboard)
router.get("/my-artist", authenticateToken, requireArtistOrAdmin, async (req, res) => {
  const client = getDBClient();
  try {
    await client.connect();
    const r = await client.query(
      "SELECT id, carrier_name, firstname, lastname, middle_name, bio, user_id FROM artists WHERE user_id = $1",
      [req.user.userId]
    );
    if (r.rows.length === 0) {
      await client.query(
        "INSERT INTO artists (carrier_name, user_id) VALUES ($1, $2)",
        [req.user.username || "Artist", req.user.userId]
      );
      const r2 = await client.query(
        "SELECT id, carrier_name, firstname, lastname, middle_name, bio, user_id FROM artists WHERE user_id = $1",
        [req.user.userId]
      );
      return res.json(r2.rows[0] || null);
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error("Portal my-artist:", err);
    res.status(500).json({ message: err.message || "Server error" });
  } finally {
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
  }
});

export default router;
