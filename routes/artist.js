/** @format */
import express from "express";
import pkg from "pg";
const { Pool } = pkg;

const router = express.Router();
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "music_app",
  password: process.env.DB_PASSWORD || "password",
  port: process.env.DB_PORT || 5432,
});

// Create a new artist
router.post("/", async (req, res) => {
  try {
    const { name, bio, imageUrl, passkey } = req.body;

    if (!name || !passkey) {
      return res.status(400).json({ error: "Name and passkey are required" });
    }

    const result = await pool.query(
      "INSERT INTO artists (name, bio, profile_image_url, passkey) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, bio || null, imageUrl || null, passkey]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating artist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all artists with pagination
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      "SELECT * FROM artists ORDER BY name LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    const countResult = await pool.query("SELECT COUNT(*) FROM artists");
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      data: result.rows,
      pagination: {
        total,
        totalPages,
        currentPage: parseInt(page),
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching artists:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single artist by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM artists WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching artist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an artist
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, bio, profile_image_url, passkey } = req.body;

    // Verify passkey if provided
    if (passkey) {
      const artist = await pool.query("SELECT * FROM artists WHERE id = $1", [
        id,
      ]);
      if (artist.rows.length === 0) {
        return res.status(404).json({ error: "Artist not found" });
      }
      if (artist.rows[0].passkey !== passkey) {
        return res.status(403).json({ error: "Invalid passkey" });
      }
    } else {
      return res.status(400).json({ error: "Passkey is required for updates" });
    }

    const result = await pool.query(
      `UPDATE artists 
       SET name = COALESCE($1, name),
           bio = COALESCE($2, bio),
           profile_image_url = COALESCE($3, profile_image_url),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [name, bio, profile_image_url, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating artist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete an artist
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { passkey } = req.body;

    if (!passkey) {
      return res
        .status(400)
        .json({ error: "Passkey is required for deletion" });
    }

    // Verify passkey
    const artist = await pool.query("SELECT * FROM artists WHERE id = $1", [
      id,
    ]);
    if (artist.rows.length === 0) {
      return res.status(404).json({ error: "Artist not found" });
    }
    if (artist.rows[0].passkey !== passkey) {
      return res.status(403).json({ error: "Invalid passkey" });
    }

    await pool.query("DELETE FROM artists WHERE id = $1", [id]);

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting artist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
