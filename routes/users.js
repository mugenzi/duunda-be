/** @format */

import express from "express";
import pkg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getDBClient } from "../config/utils.js";
const { Pool } = pkg;
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

// Avatar upload: store in uploads/avatars/
const avatarDir = path.join(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase().replace(/jpeg/, ".jpg");
    cb(null, `user_${req.user.userId}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || "").toLowerCase();
    const mimetypeOk = /image\/(jpeg|jpg|png|gif|webp|pjpeg|x-png)/.test(mimetype);
    const name = (file.originalname || "").toLowerCase();
    const extOk = /\.(jpe?g|png|gif|webp)$/.test(name);
    const genericBinary = mimetype === "application/octet-stream" || mimetype === "";
    if (mimetypeOk || extOk || genericBinary) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

// Build absolute URL for profile picture (use BASE_URL or request origin)
function getBaseUrl(req) {
  const base = process.env.BASE_URL;
  if (base) return base.replace(/\/$/, "");
  const protocol = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("host") || "";
  return host ? `${protocol}://${host}` : "";
}

// Get user profile (listener-focused; no artist-specific fields in response)
router.get("/profile", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    await client.connect();
    const user = await client.query(
      "SELECT id, username, email, firstname, lastname, role, date_of_birth, gender, profile_picture_url, created_at, updated_at FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const row = user.rows[0];
    const baseUrl = getBaseUrl(req);
    const updatedAt = row.updated_at ? new Date(row.updated_at).getTime() : null;
    res.json({
      ...row,
      profile_picture_url: row.profile_picture_url
        ? baseUrl + row.profile_picture_url
        : null,
      updated_at: updatedAt,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Update user profile (firstname, lastname required; date_of_birth, gender, profile_picture_url optional)
router.put("/profile", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    const { firstname, lastname, date_of_birth, gender, profile_picture_url } = req.body;

    if (!firstname || !lastname) {
      return res.status(400).json({ message: "First name and last name are required" });
    }

    await client.connect();
    const result = await client.query(
      `UPDATE users SET
        firstname = $1, lastname = $2,
        date_of_birth = $3, gender = $4,
        profile_picture_url = COALESCE($5, profile_picture_url),
        updated_at = NOW()
       WHERE id = $6
       RETURNING id, username, email, firstname, lastname, role, date_of_birth, gender, profile_picture_url, created_at`,
      [
        firstname.trim(),
        lastname.trim(),
        date_of_birth || null,
        gender || null,
        profile_picture_url || null,
        req.user.userId,
      ]
    );
    client.end();

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const row = result.rows[0];
    const baseUrl = getBaseUrl(req);
    res.json({
      message: "Profile updated successfully",
      user: {
        ...row,
        profile_picture_url: row.profile_picture_url
          ? baseUrl + row.profile_picture_url
          : null,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Change password (current password confirmation required)
router.post("/profile/change-password", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    await client.connect();
    const user = await client.query("SELECT password_hash FROM users WHERE id = $1", [req.user.userId]);
    if (user.rows.length === 0) {
      client.end();
      return res.status(404).json({ message: "User not found" });
    }

    const valid = await bcrypt.compare(currentPassword, user.rows[0].password_hash);
    if (!valid) {
      client.end();
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const saltRounds = 10;
    const hash = await bcrypt.hash(newPassword, saltRounds);
    await client.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [
      hash,
      req.user.userId,
    ]);
    client.end();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Upload profile picture (camera or gallery); returns profile_picture_url and updates user
router.post(
  "/profile/avatar",
  authenticateToken,
  uploadAvatar.single("photo"),
  async (req, res) => {
    const client = getDBClient();
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      const relativePath = "/uploads/avatars/" + path.basename(req.file.path);
      await client.connect();
      await client.query("UPDATE users SET profile_picture_url = $1, updated_at = NOW() WHERE id = $2", [
        relativePath,
        req.user.userId,
      ]);

      const baseUrl = getBaseUrl(req);
      const fullUrl = baseUrl + relativePath;
      res.json({
        message: "Profile picture updated",
        profile_picture_url: fullUrl,
      });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.status(500).json({ message: "Server error" });
    } finally {
      try {
        await client.end();
      } catch (e) {
        // ignore if already closed
      }
    }
  }
);

// Multer errors (e.g. file too large, invalid type) → 400
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Image must be 5MB or less" });
    }
    return res.status(400).json({ message: err.message || "Upload error" });
  }
  if (err.message && err.message.includes("Only image")) {
    return res.status(400).json({ message: "Only image files are allowed" });
  }
  next(err);
});

// Get user's uploaded songs (kept for backward compatibility; artist management is via web)
router.get("/songs", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const songs = await pool.query(
      `SELECT * FROM songs 
       WHERE uploaded_by = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [req.user.userId, limit, offset]
    );

    res.json({
      songs: songs.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: songs.rows.length,
      },
    });
  } catch (error) {
    console.error("Error fetching user songs:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
