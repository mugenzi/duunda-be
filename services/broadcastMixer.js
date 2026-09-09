/** @format */

import { spawn, execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegStatic from "ffmpeg-static";

const mixers = new Map();
const SAMPLE_RATE = 44100;
const SILENCE_BYTES = Math.floor((SAMPLE_RATE * 2) / 50); // 20ms mono s16le
const SILENCE_FRAME = Buffer.alloc(SILENCE_BYTES);

let ffmpegOk;

export function ffmpegBinary() {
  return process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
}

export function hasFfmpeg() {
  if (ffmpegOk !== undefined) return ffmpegOk;
  const bin = ffmpegBinary();
  try {
    execFileSync(bin, ["-version"], { stdio: "ignore", timeout: 4000 });
    ffmpegOk = true;
    console.log(`[broadcast mixer] using ffmpeg at ${bin}`);
  } catch {
    ffmpegOk = false;
    console.error(`[broadcast mixer] ffmpeg not runnable at ${bin}`);
  }
  return ffmpegOk;
}

function icecastConfigured() {
  return Boolean(process.env.ICECAST_HOST && process.env.ICECAST_SOURCE_PASSWORD);
}

export function mixerTrackPath(broadcastId) {
  return path.join(os.tmpdir(), `duunda-broadcast-${Number(broadcastId)}.mp3`);
}

export function writeMixerTrackFile(broadcastId, buffer) {
  const dest = mixerTrackPath(broadcastId);
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  fs.writeFileSync(dest, bytes);
  return dest;
}

export function buildMixerArgs(entry) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+nobuffer",
    "-flush_packets",
    "1",
  ];

  if (entry?.trackPath && fs.existsSync(entry.trackPath)) {
    args.push("-re", "-stream_loop", "-1", "-i", entry.trackPath);
  } else {
    args.push(
      "-f",
      "lavfi",
      "-re",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100"
    );
  }

  // probesize must sit on the stdin input or ffmpeg blocks until megabytes of PCM arrive.
  args.push(
    "-f",
    "s16le",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "1",
    "-probesize",
    "32",
    "-analyzeduration",
    "0",
    "-thread_queue_size",
    "512",
    "-i",
    "pipe:0",
    "-filter_complex",
    "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=0.85[t];[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.4[m];[t][m]amix=inputs=2:duration=longest:dropout_transition=2:normalize=0[a]",
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-flush_packets",
    "1",
    "-f",
    "mp3",
    "pipe:1"
  );
  return args;
}

function stopProcess(entry) {
  if (!entry) return;
  if (entry.silenceTimer) {
    clearInterval(entry.silenceTimer);
    entry.silenceTimer = null;
  }
  if (entry.proc) {
    try {
      entry.proc.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      entry.proc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    entry.proc = null;
  }
}

function fanout(entry, chunk) {
  if (!entry?.listeners?.size) return;
  for (const res of [...entry.listeners]) {
    if (res.writableEnded || res.destroyed) {
      entry.listeners.delete(res);
      continue;
    }
    try {
      res.write(chunk);
    } catch {
      entry.listeners.delete(res);
    }
  }
}

function spawnMixer(broadcastId, entry) {
  if (!hasFfmpeg() && !icecastConfigured()) {
    return null;
  }

  const proc = spawn(ffmpegBinary(), buildMixerArgs(entry), {
    stdio: ["pipe", "pipe", "pipe"],
  });

  proc.stdout?.on("data", (chunk) => fanout(entry, chunk));
  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) {
      console.error(`[broadcast mixer ${broadcastId}] ${text}`);
    }
  });
  proc.on("exit", (code) => {
    const current = mixers.get(broadcastId);
    if (current?.proc === proc) {
      current.proc = null;
    }
    if (code && code !== 0) {
      console.error(`[broadcast mixer ${broadcastId}] ffmpeg exited ${code}`);
    }
  });

  return proc;
}

function feedMixerStdin(broadcastId, buffer, fromMic) {
  const entry = mixers.get(broadcastId);
  if (!entry?.proc?.stdin || entry.proc.stdin.destroyed) return;
  if (fromMic) entry.lastPcmAt = Date.now();
  try {
    entry.proc.stdin.write(buffer);
  } catch {
    /* ignore backpressure / closed pipe */
  }
}

function ensureSilencePump(broadcastId, entry) {
  if (entry.silenceTimer) return;
  entry.silenceTimer = setInterval(() => {
    const idleFor = Date.now() - (entry.lastPcmAt || 0);
    if (idleFor >= 25) {
      feedMixerStdin(broadcastId, SILENCE_FRAME, false);
    }
  }, 20);
}

function ensureEntry(broadcastId, extras = {}) {
  let entry = mixers.get(broadcastId);
  if (!entry) {
    entry = {
      mountPath: extras.mountPath || "",
      audioUrl: extras.audioUrl || null,
      trackPath: extras.trackPath || null,
      micOn: false,
      proc: null,
      listeners: new Set(),
      silenceTimer: null,
      lastPcmAt: 0,
    };
    mixers.set(broadcastId, entry);
  } else {
    if (extras.mountPath) entry.mountPath = extras.mountPath;
    if (Object.prototype.hasOwnProperty.call(extras, "audioUrl")) {
      entry.audioUrl = extras.audioUrl || null;
    }
    if (Object.prototype.hasOwnProperty.call(extras, "trackPath")) {
      entry.trackPath = extras.trackPath || null;
    }
  }
  return entry;
}

function launchProcess(broadcastId, entry) {
  if (!(hasFfmpeg() || icecastConfigured())) {
    console.log(
      `[broadcast mixer ${broadcastId}] ffmpeg not available; serving catalog file only`
    );
    return;
  }
  entry.proc = spawnMixer(broadcastId, entry);
  ensureSilencePump(broadcastId, entry);
  feedMixerStdin(broadcastId, SILENCE_FRAME, false);
}

export function startMixer(broadcastId, extras = {}) {
  const prev = mixers.get(broadcastId);
  const listeners = prev?.listeners || new Set();
  stopProcess(prev);

  const entry = ensureEntry(broadcastId, extras);
  entry.listeners = listeners;
  entry.micOn = Boolean(prev?.micOn);
  launchProcess(broadcastId, entry);
  mixers.set(broadcastId, entry);
}

export function setMixerTrack(broadcastId, extras = {}) {
  const entry = ensureEntry(broadcastId, extras);
  if (!entry.proc) return;
  const listeners = entry.listeners;
  const micOn = entry.micOn;
  const mountPath = entry.mountPath;
  stopProcess(entry);
  entry.listeners = listeners;
  entry.micOn = micOn;
  entry.mountPath = mountPath;
  launchProcess(broadcastId, entry);
}

export function writeMixerPcm(broadcastId, buffer) {
  feedMixerStdin(broadcastId, buffer, true);
}

export function setMixerMic(broadcastId, micOn) {
  const entry = ensureEntry(broadcastId);
  entry.micOn = Boolean(micOn);
  if (!entry.micOn && entry.proc && !entry.listeners.size) {
    stopProcess(entry);
  }
}

export function stopMixer(broadcastId) {
  const entry = mixers.get(broadcastId);
  if (entry?.listeners) {
    for (const res of entry.listeners) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    entry.listeners.clear();
  }
  stopProcess(entry);
  try {
    fs.unlinkSync(mixerTrackPath(broadcastId));
  } catch {
    /* ignore */
  }
  mixers.delete(broadcastId);
}

export function isMixerConfigured() {
  return icecastConfigured();
}

export function ensureMixer(broadcastId, extras = {}) {
  const entry = mixers.get(Number(broadcastId));
  if (entry?.proc && !entry.proc.killed) {
    const nextPath = extras.trackPath;
    if (nextPath && nextPath !== entry.trackPath) {
      setMixerTrack(broadcastId, extras);
    }
    return;
  }
  startMixer(broadcastId, extras);
}

export function hasLiveMixer(broadcastId) {
  const entry = mixers.get(Number(broadcastId));
  return Boolean(entry?.proc && !entry.proc.killed);
}

hasFfmpeg();

export function attachLiveMp3Listener(broadcastId, req, res) {
  const id = Number(broadcastId);
  let entry = mixers.get(id);
  if (!entry?.proc && (hasFfmpeg() || icecastConfigured())) {
    startMixer(id, {
      mountPath: entry?.mountPath,
      audioUrl: entry?.audioUrl,
      trackPath: entry?.trackPath,
    });
    entry = mixers.get(id);
  }
  if (!entry?.proc) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Accept-Ranges", "none");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  entry.listeners.add(res);
  const drop = () => {
    entry.listeners.delete(res);
  };
  req.on("close", drop);
  res.on("close", drop);
  res.on("error", drop);
  return true;
}
