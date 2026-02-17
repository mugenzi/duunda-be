/** @format */

import express from "express";
import pkg from "pg";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";
const router = express.Router();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback_secret",
    (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      req.user = user;
      next();
    }
  );
};

// Get user's playlists
router.get("/", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const playlists = await client.query(
      `SELECT p.*, COUNT(ps.song_id) as song_count
       FROM playlists p
       LEFT JOIN playlist_songs ps ON p.id = ps.playlist_id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.userId]
    );
    for (let i = 0; i < playlists.rows.length; i++) {
      const songs = await client.query(
        `SELECT CONCAT('${process.env.COVER_BASEPATH}', s.cover_url) as cover_url
         FROM songs s
         JOIN playlist_songs ps ON s.id = ps.song_id
         WHERE ps.playlist_id = $1
         ORDER BY ps.added_at ASC`,
        [playlists.rows[i].id]
      );
      playlists.rows[i].songs = songs.rows.map((song) => song.cover_url);
    }
    res.json(playlists.rows);
  } catch (error) {
    console.error("Error fetching playlists:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Get single playlist with songs
router.get("/:id", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const { id } = req.params;

    // Get playlist info
    const playlist = await client.query(
      "SELECT * FROM playlists WHERE id = $1 AND user_id = $2",
      [id, req.user.userId]
    );

    if (playlist.rows.length === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    // Get songs in playlist (with engagement counts)
    const songs = await client.query(
      `SELECT s.id, s.title, s.artist, s.album, s.genre, s.duration, s.cover_url, s.audio_url, ps.added_at,
              CONCAT('${process.env.COVER_BASEPATH}', s.cover_url) as cover_url,
              CONCAT('${process.env.TRACK_BASEPATH}', s.audio_url) as audio_url,
              (SELECT COUNT(*)::int FROM song_plays WHERE song_id = s.id) AS "playCount",
              (SELECT COUNT(*)::int FROM song_likes WHERE song_id = s.id) AS "likeCount",
              (SELECT COUNT(*)::int FROM song_dislikes WHERE song_id = s.id) AS "dislikeCount",
              (SELECT COUNT(*)::int FROM song_comments WHERE song_id = s.id) AS "commentCount"
       FROM songs s
       JOIN playlist_songs ps ON s.id = ps.song_id
       WHERE ps.playlist_id = $1
       ORDER BY ps.added_at ASC`,
      [id]
    );

    res.json({
      ...playlist.rows[0],
      songs: songs.rows.map((song) => {
        const coverUrl = song.cover_url;
        const audioUrl = song.audio_url;
        delete song.cover_url;
        delete song.audio_url;
        return {
          ...song,
          coverUrl,
          audioUrl,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Create new playlist
router.post("/", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Playlist name is required" });
    }

    const newPlaylist = await client.query(
      `INSERT INTO playlists (name, description, user_id, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING *`,
      [name, description || null, req.user.userId]
    );

    res.status(201).json({
      message: "Playlist created successfully",
      playlist: newPlaylist.rows[0],
    });
  } catch (error) {
    console.error("Error creating playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Update playlist
router.put("/:id", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const { id } = req.params;
    const { name, description } = req.body;

    const updatedPlaylist = await client.query(
      `UPDATE playlists 
       SET name = $1, description = $2, updated_at = NOW() 
       WHERE id = $3 AND user_id = $4 
       RETURNING *`,
      [name, description, id, req.user.userId]
    );

    if (updatedPlaylist.rows.length === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    res.json({
      message: "Playlist updated successfully",
      playlist: updatedPlaylist.rows[0],
    });
  } catch (error) {
    console.error("Error updating playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Delete playlist
router.delete("/:id", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const { id } = req.params;

    const result = await client.query(
      "DELETE FROM playlists WHERE id = $1 AND user_id = $2",
      [id, req.user.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    res.json({ message: "Playlist deleted successfully" });
  } catch (error) {
    console.error("Error deleting playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Add song to playlist
router.post("/add/song", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();

    const { songId, playlistId } = req.body;

    // Check if playlist exists and belongs to user
    const playlist = await client.query(
      "SELECT * FROM playlists WHERE id = $1 AND user_id = $2",
      [playlistId, req.user.userId]
    );

    if (playlist.rows.length === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    // Check if song exists
    const song = await client.query("SELECT * FROM songs WHERE id = $1", [
      songId,
    ]);
    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }

    // Check if song is already in playlist
    const existing = await client.query(
      "SELECT * FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2",
      [playlistId, songId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Song already in playlist" });
    }

    // Add song to playlist
    await client.query(
      "INSERT INTO playlist_songs (playlist_id, song_id, added_at) VALUES ($1, $2, NOW())",
      [playlistId, songId]
    );

    res.json({ message: "Song added to playlist successfully" });
  } catch (error) {
    console.log("Error adding song to playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Remove song from playlist
router.delete("/:id/songs/:songId", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const { id, songId } = req.params;

    // Check if playlist exists and belongs to user
    const playlist = await client.query(
      "SELECT * FROM playlists WHERE id = $1 AND user_id = $2",
      [id, req.user.userId]
    );

    if (playlist.rows.length === 0) {
      return res.status(404).json({ message: "Playlist not found" });
    }

    const result = await client.query(
      "DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2",
      [id, songId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Song not found in playlist" });
    }

    res.json({ message: "Song removed from playlist successfully" });
  } catch (error) {
    console.error("Error removing song from playlist:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

export default router;
