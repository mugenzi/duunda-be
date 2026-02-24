/** @format */

import express from "express";
import pkg from "pg";
import jwt from "jsonwebtoken";
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

// Get user profile
router.get("/profile", authenticateToken, async (req, res) => {
  const client = getDBClient();
  try {
    client.connect();
    const user = await client.query(
      "SELECT id, username, email, firstname, lastname, role, created_at FROM users WHERE id = $1",
      [req.user.userId]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      ...user.rows[0],
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    client.end();
  }
});

// Update user profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res
        .status(400)
        .json({ message: "Username and email are required" });
    }

    // Check if username/email already exists for other users
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE (username = $1 OR email = $2) AND id != $3",
      [username, email, req.user.userId]
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(400)
        .json({ message: "Username or email already taken" });
    }

    const updatedUser = await pool.query(
      "UPDATE users SET username = $1, email = $2, updated_at = NOW() WHERE id = $3 RETURNING id, username, email, created_at",
      [username, email, req.user.userId]
    );

    res.json({
      message: "Profile updated successfully",
      user: updatedUser.rows[0],
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's uploaded songs
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
