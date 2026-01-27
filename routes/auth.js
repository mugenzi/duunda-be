/** @format */

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";
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

// Register user
router.post("/register", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if user already exists
    const userExists = await client.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );
    console.log("userExists", userExists);

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const newUser = await client.query(
      "INSERT INTO users (username, email, password_hash, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, username, email, created_at",
      [username, email, hashedPassword]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.rows[0].id, username: newUser.rows[0].username },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      user: newUser.rows[0],
      token,
    });
    client.end();
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// Login user basic auth
router.post("/login", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const { email, password } = req.body;
    console.log("tejas --- ", email, password);
    // Validate input
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    // Find user
    const user = await client.query(
      "SELECT id, username, email, password_hash FROM users WHERE email = $1",
      [email]
    );
    console.log("tejas --- ", user.rows);

    if (user.rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Email or password is incorrect" });
    }

    // Check password
    console.log("tejas --- ", password, user.rows[0].password_hash);
    const validPassword = await bcrypt.compare(
      password,
      user.rows[0].password_hash
    );
    console.log("tejas --- ", validPassword);
    if (!validPassword) {
      client.end();
      return res
        .status(401)
        .json({ message: "Email or password is incorrect" });
    }
    console.log("tejas", validPassword);
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.rows[0].id, username: user.rows[0].username },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    client.end();
    res.json({
      message: "Login successful",
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
      },
      token,
    });
  } catch (error) {
    console.log("Login error:", JSON.stringify(error));
    res.status(500).json({
      message:
        "Server Could not respond at this moment, Please try again later",
      error: error,
    });
  }
});

// Verify token endpoint
router.get("/verify", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret"
    );

    // Get user info
    const user = await client.query(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [decoded.userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }
    client.end();
    res.json({
      valid: true,
      user: user.rows[0],
    });
  } catch (error) {
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;
