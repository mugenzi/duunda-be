/** @format */

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pkg from "pg";
import nodemailer from "nodemailer";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";
const { Pool } = pkg;
const router = express.Router();

const RESET_OTP_EXPIRY_MINUTES = 15;
const FROM_EMAIL = process.env.RESET_FROM_EMAIL || "duunda@assyncs.com";
const FROM_NAME = process.env.RESET_FROM_NAME || "Duunda Team";

// Database connection
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "music_app",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432,
});

// Register user (firstname, lastname, email, password; username = email)
router.post("/register", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const { firstname, lastname, email, password } = req.body;
    const username = email;

    // Validate input
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ message: "First name, last name, email and password are required" });
    }

    // Check if user already exists
    const userExists = await client.query(
      "SELECT id FROM users WHERE email = $1 OR username = $2",
      [email, username]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user (username = email; role defaults to listener via DB)
    const newUser = await client.query(
      "INSERT INTO users (username, email, password_hash, firstname, lastname, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, username, email, firstname, lastname, role, created_at",
      [username, email, hashedPassword, firstname.trim(), lastname.trim()]
    );

    // Generate JWT token (include role)
    const token = jwt.sign(
      { userId: newUser.rows[0].id, username: newUser.rows[0].username, role: newUser.rows[0].role || "listener" },
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

    // Find user (include role)
    const user = await client.query(
      "SELECT id, username, email, firstname, lastname, password_hash, role FROM users WHERE email = $1",
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
    // Generate JWT token (include role)
    const u = user.rows[0];
    const token = jwt.sign(
      { userId: u.id, username: u.username, role: u.role || "listener" },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );
    client.end();
    res.json({
      message: "Login successful",
      user: {
        id: u.id,
        username: u.username,
        email: u.email,
        firstname: u.firstname,
        lastname: u.lastname,
        role: u.role || "listener",
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
      "SELECT id, username, email, firstname, lastname, created_at FROM users WHERE id = $1",
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

// Request password reset: send 6-digit OTP to email
router.post("/forgot-password", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const { email } = req.body;

    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await client.query(
      "SELECT id, email FROM users WHERE email = $1",
      [normalizedEmail]
    );

    // Always return success to avoid email enumeration
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + RESET_OTP_EXPIRY_MINUTES * 60 * 1000);

    await client.query(
      "INSERT INTO password_reset_otps (email, otp, expires_at) VALUES ($1, $2, $3)",
      [normalizedEmail, otp, expiresAt]
    );
    client.end();

    if (user.rows.length > 0) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "localhost",
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });

      await transporter.sendMail({
        from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
        to: normalizedEmail,
        subject: "Duunda – Password reset code",
        text: `Your password reset code is: ${otp}. It expires in ${RESET_OTP_EXPIRY_MINUTES} minutes.`,
        html: `<p>Your password reset code is: <strong>${otp}</strong>.</p><p>It expires in ${RESET_OTP_EXPIRY_MINUTES} minutes.</p>`,
      });
    }

    res.json({
      message: "If an account exists with this email, you will receive a reset code shortly.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

// Verify OTP and set new password
router.post("/verify-reset", async (req, res) => {
  try {
    const client = getDBClient();
    client.connect();
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP and new password are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const otpStr = String(otp).replace(/\D/g, "").slice(0, 6);

    if (otpStr.length !== 6) {
      return res.status(400).json({ message: "OTP must be 6 digits" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const row = await client.query(
      "SELECT id, email, otp, expires_at FROM password_reset_otps WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
      [normalizedEmail]
    );

    if (row.rows.length === 0) {
      return res.status(400).json({ message: "Invalid or expired reset code" });
    }

    const record = row.rows[0];
    if (record.otp !== otpStr) {
      return res.status(400).json({ message: "Invalid reset code" });
    }

    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ message: "Reset code has expired" });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await client.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2",
      [hashedPassword, normalizedEmail]
    );

    await client.query("DELETE FROM password_reset_otps WHERE email = $1", [
      normalizedEmail,
    ]);
    client.end();

    res.json({ message: "Password has been reset successfully. You can now log in." });
  } catch (error) {
    console.error("Verify reset error:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

export default router;
