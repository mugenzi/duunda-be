/** @format */

import express from "express";
import jwt from "jsonwebtoken";
import { getDBClient } from "../config/utils.js";
import { ensureBroadcastTables } from "../config/broadcastSchema.js";
import {
  addClient,
  broadcastEvent,
  closeRoom,
  getMicOn,
  listenerCount,
  removeClient,
  setBroadcastEndHandler,
  setMicOn,
} from "../services/broadcastHub.js";
import {
  isMixerConfigured,
  setMixerMic,
  setMixerTrack,
  stopMixer,
  writeMixerPcm,
  attachLiveMp3Listener,
  hasFfmpeg,
  ensureMixer,
  writeMixerTrackFile,
  mixerTrackPath,
} from "../services/broadcastMixer.js";
import { resolveListenUrl } from "../services/broadcastListenUrl.js";
import { sendAudioFile } from "../services/sendAudioFile.js";

const router = express.Router();

function jwtSecret() {
  // Read at request time. ESM imports run before index.js can dotenv.config(),
  // so a module-level process.env.JWT_SECRET snapshot is "fallback_secret"
  // and rejects real login tokens.
  return process.env.JWT_SECRET || "fallback_secret";
}

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }
  jwt.verify(token, jwtSecret(), (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

async function withClient(fn) {
  const client = getDBClient();
  try {
    await client.connect();
    return await fn(client);
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

function publicListenUrl(mountPath) {
  const base = (process.env.RADIO_PUBLIC_BASE_URL || "https://radio.duunda.com").replace(
    /\/$/,
    ""
  );
  return `${base}${mountPath}`;
}

function mediaUrl(path, baseEnv) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env[baseEnv] || "";
  return `${base}${path}`;
}

function mapBroadcast(row, extras = {}) {
  const currentTrackId = row.current_track_id ?? null;
  return {
    id: row.id,
    hostUserId: row.host_user_id,
    hostUsername: row.host_username || null,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    mountPath: row.mount_path,
    listenUrl: resolveListenUrl({
      icecastConfigured: isMixerConfigured(),
      mountListenUrl: row.listen_url,
      broadcastId: row.id,
      trackId: currentTrackId,
      audioUrl: mediaUrl(row.current_track_audio, "TRACK_BASEPATH"),
    }),
    currentTrackId,
    currentTrack: currentTrackId
      ? {
          id: currentTrackId,
          title: row.current_track_title || null,
          artist: row.current_track_artist || null,
          coverUrl: mediaUrl(row.current_track_cover, "COVER_BASEPATH"),
          audioUrl: mediaUrl(row.current_track_audio, "TRACK_BASEPATH"),
        }
      : null,
    listenerCount: Number(row.listener_count || 0),
    micOn: extras.micOn ?? getMicOn(row.id),
  };
}

const BROADCAST_SELECT = `
  SELECT b.id, b.host_user_id, b.title, b.status, b.started_at, b.ended_at,
         b.mount_path, b.listen_url, b.current_track_id, b.listener_count,
         u.username AS host_username,
         s.title AS current_track_title,
         s.artist AS current_track_artist,
         s.cover_url AS current_track_cover,
         s.audio_url AS current_track_audio
    FROM broadcasts b
    JOIN users u ON u.id = b.host_user_id
    LEFT JOIN songs s ON s.id = b.current_track_id
`;

async function fetchBroadcast(client, id) {
  const result = await client.query(`${BROADCAST_SELECT} WHERE b.id = $1`, [id]);
  return result.rows[0] || null;
}

async function syncListenerCount(client, broadcastId) {
  const counted = await client.query(
    `SELECT COUNT(*)::int AS count FROM broadcast_listeners WHERE broadcast_id = $1`,
    [broadcastId]
  );
  const count = counted.rows[0]?.count ?? 0;
  await client.query(`UPDATE broadcasts SET listener_count = $1 WHERE id = $2`, [
    count,
    broadcastId,
  ]);
  return count;
}

async function endBroadcastRecord(broadcastId, reason = "ended") {
  return withClient(async (client) => {
    const existing = await fetchBroadcast(client, broadcastId);
    if (!existing) return null;
    if (existing.status === "ended") {
      return mapBroadcast(existing, { micOn: false });
    }

    const updated = await client.query(
      `UPDATE broadcasts
          SET status = 'ended', ended_at = NOW(), current_track_id = NULL
        WHERE id = $1 AND status = 'live'
        RETURNING id`,
      [broadcastId]
    );
    if (updated.rows.length === 0) {
      const latest = await fetchBroadcast(client, broadcastId);
      return latest ? mapBroadcast(latest, { micOn: false }) : null;
    }

    await client.query(`DELETE FROM broadcast_listeners WHERE broadcast_id = $1`, [
      broadcastId,
    ]);
    await client.query(`UPDATE broadcasts SET listener_count = 0 WHERE id = $1`, [
      broadcastId,
    ]);

    stopMixer(broadcastId);
    closeRoom(broadcastId, { type: "broadcast_ended", reason });
    const latest = await fetchBroadcast(client, broadcastId);
    return latest ? mapBroadcast(latest, { micOn: false }) : null;
  });
}

setBroadcastEndHandler((broadcastId, reason) => {
  endBroadcastRecord(broadcastId, reason).catch((error) => {
    console.error("Auto-end broadcast failed:", error);
  });
});

router.post("/", authenticateToken, async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "Broadcast title is required" });
    }
    if (title.length > 120) {
      return res.status(400).json({ message: "Title must be 120 characters or fewer" });
    }

    const payload = await withClient(async (client) => {
      const live = await client.query(
        `${BROADCAST_SELECT} WHERE b.host_user_id = $1 AND b.status = 'live' LIMIT 1`,
        [req.user.userId]
      );
      if (live.rows.length > 0) {
        return { existing: true, row: live.rows[0] };
      }

      const inserted = await client.query(
        `INSERT INTO broadcasts (host_user_id, title, status, mount_path, listen_url)
         VALUES ($1, $2, 'live', '', '')
         RETURNING id`,
        [req.user.userId, title]
      );
      const id = inserted.rows[0].id;
      const mountPath = `/live/${id}.mp3`;
      const listenUrl = isMixerConfigured() ? publicListenUrl(mountPath) : "";
      await client.query(
        `UPDATE broadcasts SET mount_path = $1, listen_url = $2 WHERE id = $3`,
        [mountPath, listenUrl, id]
      );
      return { existing: false, row: await fetchBroadcast(client, id) };
    });

    const broadcast = mapBroadcast(payload.row);
    return res.status(payload.existing ? 200 : 201).json({
      message: payload.existing
        ? "You already have a live broadcast"
        : "Broadcast started",
      broadcast,
    });
  } catch (error) {
    console.error("Error starting broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/", authenticateToken, async (req, res) => {
  try {
    const data = await withClient(async (client) => {
      const live = await client.query(
        `${BROADCAST_SELECT} WHERE b.status = 'live' ORDER BY b.started_at DESC`
      );
      const mine = await client.query(
        `${BROADCAST_SELECT} WHERE b.host_user_id = $1 AND b.status = 'live' LIMIT 1`,
        [req.user.userId]
      );
      return { live: live.rows, mine: mine.rows[0] || null };
    });

    return res.json({
      broadcasts: data.live.map((row) => mapBroadcast(row)),
      myLiveBroadcast: data.mine ? mapBroadcast(data.mine) : null,
    });
  } catch (error) {
    console.error("Error listing broadcasts:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/comments", authenticateToken, async (req, res) => {
  try {
    const broadcastId = Number(req.params.id);
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 100);
    const offset = (page - 1) * limit;

    const data = await withClient(async (client) => {
      const broadcast = await fetchBroadcast(client, broadcastId);
      if (!broadcast) return null;
      const comments = await client.query(
        `SELECT c.id, c.broadcast_id, c.user_id, c.text, c.created_at, u.username
           FROM broadcast_comments c
           JOIN users u ON u.id = c.user_id
          WHERE c.broadcast_id = $1
          ORDER BY c.created_at DESC
          LIMIT $2 OFFSET $3`,
        [broadcastId, limit, offset]
      );
      const total = await client.query(
        `SELECT COUNT(*)::int AS count FROM broadcast_comments WHERE broadcast_id = $1`,
        [broadcastId]
      );
      return { comments: comments.rows, total: total.rows[0].count };
    });

    if (!data) {
      return res.status(404).json({ message: "Broadcast not found" });
    }

    return res.json({
      totalComments: data.total,
      comments: data.comments.map((row) => ({
        id: row.id,
        broadcastId: row.broadcast_id,
        userId: row.user_id,
        username: row.username,
        text: row.text,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching broadcast comments:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/comments", authenticateToken, async (req, res) => {
  try {
    const broadcastId = Number(req.params.id);
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ message: "Comment text is required" });
    }
    if (text.length > 500) {
      return res.status(400).json({ message: "Comment must be 500 characters or fewer" });
    }

    const comment = await withClient(async (client) => {
      const broadcast = await fetchBroadcast(client, broadcastId);
      if (!broadcast) return { missing: true };
      if (broadcast.status !== "live") {
        return { ended: true };
      }
      const inserted = await client.query(
        `INSERT INTO broadcast_comments (broadcast_id, user_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, broadcast_id, user_id, text, created_at`,
        [broadcastId, req.user.userId, text]
      );
      return inserted.rows[0];
    });

    if (comment?.missing) {
      return res.status(404).json({ message: "Broadcast not found" });
    }
    if (comment?.ended) {
      return res.status(409).json({ message: "Broadcast has ended" });
    }

    const payload = {
      id: comment.id,
      broadcastId: comment.broadcast_id,
      userId: comment.user_id,
      username: req.user.username,
      text: comment.text,
      createdAt: comment.created_at,
    };
    broadcastEvent(broadcastId, { type: "comment", comment: payload });
    return res.status(201).json(payload);
  } catch (error) {
    console.error("Error posting broadcast comment:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/join", authenticateToken, async (req, res) => {
  try {
    const broadcastId = Number(req.params.id);
    const result = await withClient(async (client) => {
      const broadcast = await fetchBroadcast(client, broadcastId);
      if (!broadcast) return { missing: true };
      if (broadcast.status !== "live") return { ended: true, broadcast };
      if (broadcast.host_user_id === req.user.userId) {
        return { host: true, broadcast };
      }
      await client.query(
        `INSERT INTO broadcast_listeners (broadcast_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (broadcast_id, user_id) DO NOTHING`,
        [broadcastId, req.user.userId]
      );
      const count = await syncListenerCount(client, broadcastId);
      return { count, broadcast: await fetchBroadcast(client, broadcastId) };
    });

    if (result.missing) {
      return res.status(404).json({ message: "Broadcast not found" });
    }
    if (result.ended) {
      return res.status(409).json({
        message: "Broadcast has ended",
        broadcast: mapBroadcast(result.broadcast),
      });
    }

    const count = result.host ? result.broadcast.listener_count : result.count;
    if (!result.host) {
      broadcastEvent(broadcastId, { type: "listener_count", listenerCount: count });
    }
    return res.json({
      message: "Joined broadcast",
      listenerCount: count,
      broadcast: mapBroadcast(result.broadcast),
    });
  } catch (error) {
    console.error("Error joining broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/leave", authenticateToken, async (req, res) => {
  try {
    const broadcastId = Number(req.params.id);
    const result = await withClient(async (client) => {
      const broadcast = await fetchBroadcast(client, broadcastId);
      if (!broadcast) return { missing: true };
      await client.query(
        `DELETE FROM broadcast_listeners WHERE broadcast_id = $1 AND user_id = $2`,
        [broadcastId, req.user.userId]
      );
      const count = await syncListenerCount(client, broadcastId);
      return { count };
    });

    if (result.missing) {
      return res.status(404).json({ message: "Broadcast not found" });
    }
    broadcastEvent(broadcastId, {
      type: "listener_count",
      listenerCount: result.count,
    });
    return res.json({ message: "Left broadcast", listenerCount: result.count });
  } catch (error) {
    console.error("Error leaving broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/end", authenticateToken, async (req, res) => {
  try {
    const broadcastId = Number(req.params.id);
    const existing = await withClient((client) => fetchBroadcast(client, broadcastId));
    if (!existing) {
      return res.status(404).json({ message: "Broadcast not found" });
    }
    if (existing.host_user_id !== req.user.userId) {
      return res.status(403).json({ message: "Only the host can end this broadcast" });
    }
    const broadcast = await endBroadcastRecord(broadcastId, "host_ended");
    return res.json({ message: "Broadcast ended", broadcast });
  } catch (error) {
    console.error("Error ending broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

async function updateLiveBroadcast(req) {
  const broadcastId = Number(req.params.id);
  const body = req.body || {};
  const hasTrack = Object.prototype.hasOwnProperty.call(body, "trackId")
    || Object.prototype.hasOwnProperty.call(body, "currentTrackId");
  const hasMic = Object.prototype.hasOwnProperty.call(body, "micOn");
  const trackId = body.trackId ?? body.currentTrackId ?? null;

  const result = await withClient(async (client) => {
    const broadcast = await fetchBroadcast(client, broadcastId);
    if (!broadcast) return { missing: true };
    if (broadcast.host_user_id !== req.user.userId) return { forbidden: true };
    if (broadcast.status !== "live") return { ended: true, broadcast };

    let audioUrl;
    if (hasTrack) {
      let nextTrackId = null;
      audioUrl = null;
      if (trackId != null && trackId !== "") {
        const song = await client.query(
          `SELECT id, title, artist, cover_url, audio_url FROM songs WHERE id = $1`,
          [trackId]
        );
        if (song.rows.length === 0) return { badTrack: true };
        nextTrackId = song.rows[0].id;
        audioUrl = mediaUrl(song.rows[0].audio_url, "TRACK_BASEPATH");
      }

      const nextListenUrl = resolveListenUrl({
        icecastConfigured: isMixerConfigured(),
        mountListenUrl: broadcast.listen_url || publicListenUrl(broadcast.mount_path),
        broadcastId,
        trackId: nextTrackId,
        audioUrl,
      });
      await client.query(
        `UPDATE broadcasts SET current_track_id = $1, listen_url = $2 WHERE id = $3`,
        [nextTrackId, nextListenUrl || "", broadcastId]
      );
    }

    return {
      broadcast: await fetchBroadcast(client, broadcastId),
      audioUrl,
      hasTrack,
      hasMic,
    };
  });

  if (result.missing || result.forbidden || result.ended || result.badTrack) {
    return result;
  }

  if (result.hasTrack) {
    const fileId = audioFileId(result.broadcast);
    if (fileId) {
      const file = await withClient(async (client) => {
        const row = await client.query(
          `SELECT file_data FROM audio_files WHERE id = $1`,
          [fileId]
        );
        return row.rows[0] || null;
      });
      if (file?.file_data) {
        setMixerTrack(broadcastId, {
          trackPath: writeMixerTrackFile(broadcastId, file.file_data),
        });
      }
    }
    const mapped = mapBroadcast(result.broadcast);
    broadcastEvent(broadcastId, {
      type: "track_changed",
      currentTrack: mapped.currentTrack,
    });
  }

  if (result.hasMic) {
    setMixerMic(broadcastId, body.micOn);
    setMicOn(broadcastId, body.micOn);
  }

  return result;
}

function sendUpdateErrors(res, result) {
  if (result.missing) {
    return res.status(404).json({ message: "Broadcast not found" });
  }
  if (result.forbidden) {
    return res.status(403).json({ message: "Only the host can update this broadcast" });
  }
  if (result.ended) {
    return res.status(409).json({ message: "Broadcast has ended" });
  }
  if (result.badTrack) {
    return res.status(404).json({ message: "Track not found" });
  }
  return null;
}

router.patch("/:id/track", authenticateToken, async (req, res) => {
  try {
    const result = await updateLiveBroadcast(req);
    if (sendUpdateErrors(res, result)) return;
    return res.json({
      message: "Track updated",
      broadcast: mapBroadcast(result.broadcast, {
        micOn: req.body?.micOn !== undefined ? Boolean(req.body.micOn) : undefined,
      }),
    });
  } catch (error) {
    console.error("Error updating broadcast track:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/:id", authenticateToken, async (req, res) => {
  try {
    const body = req.body || {};
    const hasTrack = Object.prototype.hasOwnProperty.call(body, "trackId")
      || Object.prototype.hasOwnProperty.call(body, "currentTrackId");
    const hasMic = Object.prototype.hasOwnProperty.call(body, "micOn");
    if (!hasTrack && !hasMic) {
      return res.status(400).json({ message: "Nothing to update" });
    }
    const result = await updateLiveBroadcast(req);
    if (sendUpdateErrors(res, result)) return;
    return res.json({
      message: hasTrack ? "Track updated" : "Broadcast updated",
      broadcast: mapBroadcast(result.broadcast, {
        micOn: hasMic ? Boolean(body.micOn) : undefined,
      }),
    });
  } catch (error) {
    console.error("Error updating broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

function audioFileId(row) {
  const raw = row?.current_track_audio;
  const fromSong = Number(raw);
  if (Number.isFinite(fromSong) && fromSong > 0) return fromSong;
  const fromTrack = Number(row?.current_track_id);
  return Number.isFinite(fromTrack) && fromTrack > 0 ? fromTrack : null;
}

async function loadTrackAudio(fileId) {
  if (!fileId) return null;
  return withClient(async (client) => {
    const result = await client.query(
      `SELECT file_data, mime_type FROM audio_files WHERE id = $1`,
      [fileId]
    );
    return result.rows[0] || null;
  });
}

async function streamBroadcastListen(req, res) {
  try {
    const broadcastId = Number(req.params.id);
    const row = await withClient((client) => fetchBroadcast(client, broadcastId));
    if (!row || row.status !== "live") {
      return res.status(410).json({ message: "Broadcast is not live" });
    }

    const fileId = audioFileId(row);
    const file = await loadTrackAudio(fileId);
    const micLive = Boolean(getMicOn(broadcastId));

    // Music-only must keep the Range/mp3 file path that iOS already plays.
    // The live mixer is only for host commentary on top of that track.
    if (micLive && hasFfmpeg()) {
      if (file?.file_data) {
        writeMixerTrackFile(broadcastId, file.file_data);
      }
      ensureMixer(broadcastId, {
        mountPath: row.mount_path,
        trackPath: file?.file_data ? mixerTrackPath(broadcastId) : null,
      });
      if (attachLiveMp3Listener(broadcastId, req, res)) {
        return;
      }
    }

    if (!file?.file_data) {
      return res.status(404).json({ message: fileId ? "Track audio not found" : "No track playing" });
    }
    const buffer = Buffer.isBuffer(file.file_data)
      ? file.file_data
      : Buffer.from(file.file_data);
    const mime = String(file.mime_type || "").startsWith("audio/")
      ? file.mime_type
      : "audio/mpeg";
    return sendAudioFile(req, res, buffer, mime);
  } catch (error) {
    console.error("Error streaming broadcast audio:", error);
    return res.status(500).json({ message: "Server error" });
  }
}

router.get("/:id/listen.mp3", streamBroadcastListen);
router.head("/:id/listen.mp3", streamBroadcastListen);

router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const row = await withClient((client) => fetchBroadcast(client, Number(req.params.id)));
    if (!row) {
      return res.status(404).json({ message: "Broadcast not found" });
    }
    return res.json({ broadcast: mapBroadcast(row) });
  } catch (error) {
    console.error("Error fetching broadcast:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export function verifyBroadcastToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

export async function handleBroadcastSocket(ws, requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  const sourceMatch = url.pathname.match(/^\/ws\/broadcasts\/(\d+)\/source$/);
  const roomMatch = url.pathname.match(/^\/ws\/broadcasts\/(\d+)$/);
  const match = sourceMatch || roomMatch;
  if (!match) {
    ws.close(1008, "Invalid path");
    return;
  }

  const broadcastId = Number(match[1]);
  const user = verifyBroadcastToken(url.searchParams.get("token"));
  if (!user?.userId) {
    ws.close(1008, "Unauthorized");
    return;
  }

  const row = await withClient((client) => fetchBroadcast(client, broadcastId));
  if (!row || row.status !== "live") {
    ws.close(1008, "Broadcast is not live");
    return;
  }

  const isHost = row.host_user_id === user.userId;
  const isSource = Boolean(sourceMatch);

  if (isSource && !isHost) {
    ws.close(1008, "Only the host can publish audio");
    return;
  }

  if (isSource) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        writeMixerPcm(broadcastId, Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        if (message?.type === "mic") {
          const micOn = Boolean(message.enabled);
          setMixerMic(broadcastId, micOn);
          setMicOn(broadcastId, micOn);
        }
        if (message?.type === "pcm" && typeof message.data === "string") {
          writeMixerPcm(broadcastId, Buffer.from(message.data, "base64"));
        }
      } catch {
        /* ignore non-json */
      }
    });
    ws.on("close", () => {
      setMixerMic(broadcastId, false);
      setMicOn(broadcastId, false);
    });
    ws.send(JSON.stringify({ type: "source_ready", broadcastId }));
    return;
  }

  const client = addClient(broadcastId, ws, { userId: user.userId, isHost });
  if (!isHost) {
    withClient(async (db) => {
      await db.query(
        `INSERT INTO broadcast_listeners (broadcast_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (broadcast_id, user_id) DO NOTHING`,
        [broadcastId, user.userId]
      );
      const count = await syncListenerCount(db, broadcastId);
      broadcastEvent(broadcastId, { type: "listener_count", listenerCount: count });
    }).catch((error) => console.error("WS join failed:", error));
  }

  ws.send(
    JSON.stringify({
      type: "hello",
      broadcast: mapBroadcast(row),
      listenerCount: listenerCount(broadcastId) || row.listener_count,
    })
  );

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message?.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch {
      /* ignore */
    }
  });

  ws.on("close", () => {
    removeClient(broadcastId, client);
    if (isHost) return;
    withClient(async (db) => {
      const live = await db.query(
        `SELECT 1 FROM broadcasts WHERE id = $1 AND status = 'live'`,
        [broadcastId]
      );
      if (live.rows.length === 0) return;
      await db.query(
        `DELETE FROM broadcast_listeners WHERE broadcast_id = $1 AND user_id = $2`,
        [broadcastId, user.userId]
      );
      const next = await syncListenerCount(db, broadcastId);
      broadcastEvent(broadcastId, { type: "listener_count", listenerCount: next });
    }).catch((error) => console.error("WS leave failed:", error));
  });
}

export { ensureBroadcastTables };
export default router;
