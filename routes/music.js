/** @format */

import express from "express";
import multer from "multer";
import path from "path";
import pkg from "pg";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";

const { Pool, Client } = pkg;
const router = express.Router();

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "music_app",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432,
});

// Authentication middleware
export const authenticateToken = (req, res, next) => {
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

// Configure multer for file uploads (memory storage for database)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50000000, // 50MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedAudioMimeTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/flac",
      "audio/mp4",
      "audio/aac",
      "audio/x-m4a",
    ];
    const allowedImageMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    const allowedAudioExtensions = /\.(mp3|wav|flac|m4a|aac)$/i;
    const allowedImageExtensions = /\.(jpg|jpeg|png|webp)$/i;

    // Check if it's an audio file
    if (file.fieldname === "audio") {
      if (
        allowedAudioMimeTypes.includes(file.mimetype) ||
        allowedAudioExtensions.test(file.originalname)
      ) {
        return cb(null, true);
      } else {
        cb(
          new Error("Only audio files are allowed (MP3, WAV, FLAC, M4A, AAC)")
        );
      }
    }

    // Check if it's a cover image
    if (file.fieldname === "cover") {
      if (
        allowedImageMimeTypes.includes(file.mimetype) ||
        allowedImageExtensions.test(file.originalname)
      ) {
        return cb(null, true);
      } else {
        cb(new Error("Only image files are allowed (JPG, JPEG, PNG, WEBP)"));
      }
    }

    cb(new Error("Invalid file field"));
  },
});

// Get all songs
router.get("/", async (req, res) => {
  try {
    const client = getDBClient();
    await client.connect();
    const { page = 1, limit = 20, genre, artist, search } = req.query;
    const offset = (page - 1) * limit;
    console.log(
      "tejas",
      process.env.TRACK_BASEPATH,
      process.env.COVER_BASEPATH
    );
    let query = `
      SELECT id, title, artist, album, genre, duration, concat('${process.env.TRACK_BASEPATH}', s.audio_url) as audioUrl, concat('${process.env.COVER_BASEPATH}', s.cover_url) as coverUrl
      FROM songs s
      WHERE 1=1
    `;
    console.log("tejas", query);
    const params = [];
    let paramCount = 0;

    if (genre) {
      paramCount++;
      query += ` AND s.genre ILIKE $${paramCount}`;
      params.push(`%${genre}%`);
    }

    if (artist) {
      paramCount++;
      query += ` AND s.artist ILIKE $${paramCount}`;
      params.push(`%${artist}%`);
    }

    if (search) {
      paramCount++;
      query += ` AND (s.title ILIKE $${paramCount} OR s.artist ILIKE $${paramCount} OR s.album ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY s.created_at DESC LIMIT $${paramCount + 1} OFFSET $${
      paramCount + 2
    }`;
    params.push(limit, offset);

    const songs = await client.query(query, params);
    await client.end();
    res.json({
      songs: songs.rows.map((song) => ({
        ...song,
        audioUrl: song.audiourl,
        coverUrl: song.coverurl,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: songs.rows.length,
      },
    });
  } catch (error) {
    console.error("Error fetching songs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/tracks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDBClient();
    await client.connect();
    const song = await client.query(
      `SELECT file_data
       FROM audio_files 
       WHERE id = $1`,
      [id]
    );

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }
    await client.end();
    const audioBuffer = song.rows[0].file_data;
    const mimeType = song.rows[0].mime_type || "image/jpeg";

    res.setHeader("Content-Type", mimeType);
    res.send(audioBuffer);
  } catch (error) {
    console.error("Error fetching song:", error);
    res.status(500).json({ message: "Server error" });
  }
});
router.get("/cover/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDBClient();
    await client.connect();
    console.log("tejas get cover", req.params);
    const song = await client.query(
      `SELECT image_data, mime_type
       FROM cover_images 
       WHERE id = $1`,
      [id]
    );

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }
    await client.end();
    const imageBuffer = song.rows[0].image_data;
    const mimeType = song.rows[0].mime_type || "image/jpeg";

    res.setHeader("Content-Type", mimeType);

    res.send(imageBuffer);
  } catch (error) {
    console.error("Error fetching song:", error);
    res.status(500).json({ message: "Server error" });
  }
});
// Get single song
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDBClient();
    await client.connect();
    const song = await client.query(
      `SELECT s.id, s.title, s.artist, s.album, s.genre, s.duration, 
             s.file_name, s.file_size, s.mime_type, s.uploaded_by, s.created_at, s.updated_at,
             u.username as uploaded_by_username 
       FROM songs s 
       JOIN users u ON s.uploaded_by = u.id 
       WHERE s.id = $1`,
      [id]
    );

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }
    await client.end();
    res.json(song.rows[0]);
  } catch (error) {
    console.error("Error fetching song:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Download/Stream audio file
router.get("/:id/download", async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDBClient();
    await client.connect();
    const song = await client.query(
      "SELECT file_data, file_name, mime_type, file_size FROM songs WHERE id = $1",
      [id]
    );

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }

    const { file_data, file_name, mime_type, file_size } = song.rows[0];

    // Set appropriate headers for audio streaming
    res.set({
      "Content-Type": mime_type,
      "Content-Length": file_size,
      "Content-Disposition": `inline; filename="${file_name}"`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000", // Cache for 1 year
    });
    await client.end();
    // Send the binary data
    res.send(file_data);
  } catch (error) {
    console.error("Error downloading song:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Upload new song
router.post(
  "/upload",
  authenticateToken,
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const client = new Client({
        user: process.env.DB_USER || "postgres",
        host: process.env.DB_HOST || "localhost",
        database: process.env.DB_NAME || "music_app",
        password: process.env.DB_PASSWORD || "password",
        port: process.env.DB_PORT || 5432,
      });
      await client.connect();
      if (!req.files.audio) {
        return res.status(400).json({ message: "Audio file is required" });
      }
      if (!req.files.cover) {
        return res.status(400).json({ message: "Cover image is required" });
      }
      // console.log(req.files.audio[0].originalname);
      // return res.status(200).json({ message: "Files uploaded successfully" });
      const { title, artist, album, genre, duration } = req.body;

      if (!title || !artist) {
        return res
          .status(400)
          .json({ message: "Title and artist are required" });
      }
      //       -- Audio files table
      // CREATE TABLE IF NOT EXISTS audio_files (
      //     id SERIAL PRIMARY KEY,
      //     file_data BYTEA NOT NULL, -- binary audio data
      //     file_name VARCHAR(255) NOT NULL, -- original filename
      //     file_size INTEGER NOT NULL, -- file size in bytes
      //     mime_type VARCHAR(100) NOT NULL, -- audio/mpeg, audio/wav, etc.
      //     uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      // );
      console.log("upload music data verification done");
      const newAudio = await client.query(
        `INSERT INTO audio_files (file_data, file_name, file_size, mime_type, uploaded_by, created_at) 
        VALUES ($1, $2, $3, $4, $5, NOW()) 
        RETURNING id, file_name, file_size, mime_type, uploaded_by, created_at`,
        [
          req.files.audio[0].buffer, // Binary data
          req.files.audio[0].originalname, // Original filename
          req.files.audio[0].size, // File size in bytes
          req.files.audio[0].mimetype, // MIME type
          req.user.userId,
        ]
      );

      //       -- Cover images table
      // CREATE TABLE IF NOT EXISTS cover_images (
      //     id SERIAL PRIMARY KEY,
      //     image_data BYTEA NOT NULL, -- binary image data
      //     file_name VARCHAR(255) NOT NULL, -- original filename
      //     file_size INTEGER NOT NULL, -- file size in bytes
      //     mime_type VARCHAR(100) NOT NULL, -- image/jpeg, image/png, etc.
      //     uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      // );
      const newCover = await client.query(
        `INSERT INTO cover_images (image_data, file_name, file_size, mime_type, uploaded_by, created_at) 
        VALUES ($1, $2, $3, $4, $5, NOW()) 
        RETURNING id, file_name, file_size, mime_type, uploaded_by, created_at`,
        [
          req.files.cover[0].buffer, // Binary data
          req.files.cover[0].originalname, // Original filename
          req.files.cover[0].size, // File size in bytes
          req.files.cover[0].mimetype, // MIME type
          req.user.userId,
        ]
      );
      //   id SERIAL PRIMARY KEY,
      // title VARCHAR(255) NOT NULL,
      // artist VARCHAR(255) NOT NULL,
      // album VARCHAR(255),
      // genre VARCHAR(100),
      // duration INTEGER, -- duration in seconds
      // audio_url VARCHAR(500) NOT NULL, -- URL to access audio file
      // cover_url VARCHAR(500), -- URL to access cover image
      // uploaded_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
      // created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      // updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      const newSong = await client.query(
        `INSERT INTO songs (title, artist, album, genre, duration, audio_url, cover_url, uploaded_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, title, artist, album, genre, duration, audio_url, cover_url, uploaded_by, created_at`,
        [
          title,
          artist,
          album || null,
          genre || null,
          duration || null,
          newAudio.rows[0].id,
          newCover.rows[0].id,
          req.user.userId,
        ]
      );
      await client.end();
      return res.status(201).json({
        message: "Song uploaded successfully",
        song: newSong.rows[0],
      });
    } catch (error) {
      console.error("Error uploading song:", error);
      res.status(500).json({ message: "Server error during upload" });
    }
  }
);

// Update song
router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const client = getDBClient();
    await client.connect();
    const { title, artist, album, genre, duration } = req.body;

    // Check if song exists and user owns it
    const song = await client.query("SELECT * FROM songs WHERE id = $1", [id]);

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }

    if (song.rows[0].uploaded_by !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this song" });
    }

    const updatedSong = await pool.query(
      `UPDATE songs 
       SET title = $1, artist = $2, album = $3, genre = $4, duration = $5, updated_at = NOW() 
       WHERE id = $6 
       RETURNING *`,
      [title, artist, album, genre, duration, id]
    );
    await client.end();
    res.json({
      message: "Song updated successfully",
      song: updatedSong.rows[0],
    });
  } catch (error) {
    console.error("Error updating song:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete song
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if song exists and user owns it
    const song = await pool.query("SELECT * FROM songs WHERE id = $1", [id]);

    if (song.rows.length === 0) {
      return res.status(404).json({ message: "Song not found" });
    }

    if (song.rows[0].uploaded_by !== req.user.userId) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this song" });
    }

    await pool.query("DELETE FROM songs WHERE id = $1", [id]);

    res.json({ message: "Song deleted successfully" });
  } catch (error) {
    console.error("Error deleting song:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
