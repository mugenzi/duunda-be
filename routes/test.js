/** @format */

// Public-facing tester feedback API.
//
// Powers https://duunda.com/test/feedback. The submission endpoint is
// intentionally public (no JWT required) so external testers can report
// issues without an account. If a tester *does* happen to be logged in,
// `optionalAuth` will attach their user id so we can correlate feedback
// with the account.
//
// Storage strategy mirrors `routes/music.js` (audio/cover): multer memory
// storage + BYTEA columns in `tester_feedback`. Attachments are never
// served from `/uploads/...`; they can only be downloaded by an admin via
// `GET /api/test/feedback/:id/attachment`.

import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";
import { authenticateToken } from "./music.js";

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────
// Middleware
// ──────────────────────────────────────────────────────────────────────

/**
 * Attach `req.user` if a valid bearer token is present, but never reject.
 * Mirrors the pattern used in `routes/engagement.js` and `routes/artists.js`.
 */
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback_secret",
    (err, user) => {
      if (!err) req.user = user;
      next();
    }
  );
};

const requireAdmin = (req, res, next) => {
  const role = req.user?.role || "listener";
  if (role !== "administrator") {
    return res.status(403).json({ message: "Administrator access required" });
  }
  next();
};

// 10 MB cap is generous for screenshots / log files but small enough to
// keep BYTEA rows healthy and abuse-resistant.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const ATTACHMENT_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream", // some browsers send this for .log
];
const ATTACHMENT_ALLOWED_EXT =
  /\.(jpg|jpeg|png|webp|gif|pdf|txt|log|zip)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const mimeOk = ATTACHMENT_ALLOWED_MIME.includes(file.mimetype);
    const extOk = ATTACHMENT_ALLOWED_EXT.test(file.originalname || "");
    if (mimeOk || extOk) return cb(null, true);
    return cb(
      new Error(
        "Attachment must be an image, PDF, text/log file, or zip archive"
      )
    );
  },
});

// ──────────────────────────────────────────────────────────────────────
// POST /api/test/feedback  (public)
// Accepts multipart/form-data with:
//   - firstName   (required)
//   - lastName    (required)
//   - email       (required)
//   - message     (required)
//   - attachment  (optional, single file)
// ──────────────────────────────────────────────────────────────────────
router.post(
  "/feedback",
  optionalAuth,
  upload.single("attachment"),
  async (req, res) => {
    const client = getDBClient();
    try {
      // Trim + normalise input. Body fields arrive as strings even from
      // multipart, so no JSON parsing needed.
      const firstName = (req.body.firstName || req.body.firstname || "")
        .toString()
        .trim();
      const lastName = (req.body.lastName || req.body.lastname || "")
        .toString()
        .trim();
      const email = (req.body.email || "").toString().trim().toLowerCase();
      const message = (req.body.message || "").toString().trim();

      if (!firstName || !lastName || !email || !message) {
        return res.status(400).json({
          message:
            "First name, last name, email, and message are all required",
        });
      }

      if (firstName.length > 80 || lastName.length > 80) {
        return res
          .status(400)
          .json({ message: "First and last name must be 80 characters or fewer" });
      }
      if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res
          .status(400)
          .json({ message: "Please provide a valid email address" });
      }
      if (message.length > 8000) {
        return res
          .status(400)
          .json({ message: "Message must be 8000 characters or fewer" });
      }

      await client.connect();

      const insert = await client.query(
        `INSERT INTO tester_feedback
           (firstname, lastname, email, message,
            attachment_data, attachment_name, attachment_size, attachment_mime,
            user_id, user_agent, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, created_at`,
        [
          firstName,
          lastName,
          email,
          message,
          req.file?.buffer || null,
          req.file?.originalname || null,
          req.file?.size || null,
          req.file?.mimetype || null,
          req.user?.userId || null,
          req.get("user-agent") || null,
          req.ip || null,
        ]
      );

      return res.status(201).json({
        message: "Thanks! Your feedback has been received.",
        id: insert.rows[0].id,
        createdAt: insert.rows[0].created_at,
      });
    } catch (error) {
      console.error("Error saving tester feedback:", error);
      return res.status(500).json({ message: "Server error" });
    } finally {
      try {
        await client.end();
      } catch (_) {
        /* noop */
      }
    }
  }
);

// ──────────────────────────────────────────────────────────────────────
// GET /api/test/feedback  (admin only)
// Paginated list, newest first, with optional ?status= filter.
// Attachment bytes are intentionally NOT returned in the list — only a
// boolean flag + filename so the admin UI can render a download link.
// ──────────────────────────────────────────────────────────────────────
router.get("/feedback", authenticateToken, requireAdmin, async (req, res) => {
  const client = getDBClient();
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit || "20", 10))
    );
    const offset = (page - 1) * limit;
    const status = req.query.status ? String(req.query.status).trim() : null;

    await client.connect();

    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }

    const totalRes = await client.query(
      `SELECT COUNT(*)::int AS total FROM tester_feedback ${where}`,
      params
    );
    const total = totalRes.rows[0]?.total || 0;

    params.push(limit, offset);
    const rows = await client.query(
      `SELECT
         id,
         firstname AS "firstName",
         lastname  AS "lastName",
         email,
         message,
         (attachment_data IS NOT NULL) AS "hasAttachment",
         attachment_name AS "attachmentName",
         attachment_size AS "attachmentSize",
         attachment_mime AS "attachmentMime",
         user_id   AS "userId",
         user_agent AS "userAgent",
         ip_address AS "ipAddress",
         status,
         created_at AS "createdAt",
         updated_at AS "updatedAt"
       FROM tester_feedback
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return res.json({
      feedback: rows.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    console.error("Error listing tester feedback:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    try {
      await client.end();
    } catch (_) {
      /* noop */
    }
  }
});

// ──────────────────────────────────────────────────────────────────────
// GET /api/test/feedback/:id/attachment  (admin only)
// Streams the BYTEA back with the original Content-Type and a
// Content-Disposition that suggests the original filename. Mirrors the
// approach used by GET /api/music/cover/:id.
// ──────────────────────────────────────────────────────────────────────
router.get(
  "/feedback/:id/attachment",
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const client = getDBClient();
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid feedback id" });
      }
      await client.connect();
      const row = await client.query(
        `SELECT attachment_data, attachment_name, attachment_mime
         FROM tester_feedback
         WHERE id = $1`,
        [id]
      );
      const r = row.rows[0];
      if (!r || !r.attachment_data) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      res.setHeader(
        "Content-Type",
        r.attachment_mime || "application/octet-stream"
      );
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${(r.attachment_name || "attachment").replace(
          /"/g,
          ""
        )}"`
      );
      return res.send(r.attachment_data);
    } catch (error) {
      console.error("Error streaming feedback attachment:", error);
      return res.status(500).json({ message: "Server error" });
    } finally {
      try {
        await client.end();
      } catch (_) {
        /* noop */
      }
    }
  }
);

// ──────────────────────────────────────────────────────────────────────
// PATCH /api/test/feedback/:id  (admin only)
// Update the triage status.
// ──────────────────────────────────────────────────────────────────────
router.patch("/feedback/:id", authenticateToken, requireAdmin, async (req, res) => {
  const ALLOWED = ["new", "triaged", "closed"];
  const status = (req.body?.status || "").toString().trim();
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({
      message: `status must be one of: ${ALLOWED.join(", ")}`,
    });
  }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: "Invalid feedback id" });
  }
  const client = getDBClient();
  try {
    await client.connect();
    const updated = await client.query(
      `UPDATE tester_feedback
         SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, status, updated_at AS "updatedAt"`,
      [status, id]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ message: "Feedback not found" });
    }
    return res.json(updated.rows[0]);
  } catch (error) {
    console.error("Error updating feedback status:", error);
    return res.status(500).json({ message: "Server error" });
  } finally {
    try {
      await client.end();
    } catch (_) {
      /* noop */
    }
  }
});

// ──────────────────────────────────────────────────────────────────────
// Multer error → 400 mapper (must be the LAST middleware on this router)
// Same shape as the one in routes/users.js so the FE can rely on `message`.
// ──────────────────────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Attachment must be 10MB or less" });
    }
    return res.status(400).json({ message: err.message || "Upload error" });
  }
  if (err?.message?.startsWith("Attachment must be")) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
});

export default router;
