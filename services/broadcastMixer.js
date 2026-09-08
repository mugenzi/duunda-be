/** @format */

import { spawn, execFileSync } from "child_process";
import { toPublicHttpsUrl } from "./broadcastListenUrl.js";

const mixers = new Map();
const SAMPLE_RATE = 44100;
const SILENCE_BYTES = Math.floor((SAMPLE_RATE * 2) / 50); // 20ms mono s16le
const SILENCE_FRAME = Buffer.alloc(SILENCE_BYTES);

let ffmpegOk;

export function ffmpegBinary() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export function hasFfmpeg() {
  if (ffmpegOk !== undefined) return ffmpegOk;
  try {
    execFileSync(ffmpegBinary(), ["-version"], { stdio: "ignore", timeout: 4000 });
    ffmpegOk = true;
  } catch {
    ffmpegOk = false;
  }
  return ffmpegOk;
}

function icecastConfigured() {
  return Boolean(process.env.ICECAST_HOST && process.env.ICECAST_SOURCE_PASSWORD);
}

function trackInputUrl(audioUrl) {
  return toPublicHttpsUrl(audioUrl) || audioUrl || null;
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

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-fflags",
    "+nobuffer",
    "-flush_packets",
    "1",
  ];
  const track = trackInputUrl(entry.audioUrl);
  if (track) {
    args.push(
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "2",
      "-re",
      "-i",
      track
    );
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }

  args.push(
    "-f",
    "s16le",
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "1",
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
    "-f",
    "mp3",
    "pipe:1"
  );

  const proc = spawn(ffmpegBinary(), args, {
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

function ensureSilencePump(broadcastId, entry) {
  if (entry.silenceTimer) return;
  entry.silenceTimer = setInterval(() => {
    if (!entry.micOn) {
      writeMixerPcm(broadcastId, SILENCE_FRAME);
    }
  }, 20);
}

function ensureEntry(broadcastId, extras = {}) {
  let entry = mixers.get(broadcastId);
  if (!entry) {
    entry = {
      mountPath: extras.mountPath || "",
      audioUrl: extras.audioUrl || null,
      micOn: false,
      proc: null,
      listeners: new Set(),
      silenceTimer: null,
    };
    mixers.set(broadcastId, entry);
  } else {
    if (extras.mountPath) entry.mountPath = extras.mountPath;
    if (Object.prototype.hasOwnProperty.call(extras, "audioUrl")) {
      entry.audioUrl = extras.audioUrl || null;
    }
  }
  return entry;
}

export function startMixer(broadcastId, { mountPath, audioUrl = null } = {}) {
  const prev = mixers.get(broadcastId);
  const listeners = prev?.listeners || new Set();
  stopProcess(prev);

  const entry = ensureEntry(broadcastId, { mountPath, audioUrl });
  entry.listeners = listeners;
  entry.micOn = Boolean(prev?.micOn);

  if (hasFfmpeg() || icecastConfigured()) {
    entry.proc = spawnMixer(broadcastId, entry);
    ensureSilencePump(broadcastId, entry);
  } else {
    console.log(
      `[broadcast mixer ${broadcastId}] ffmpeg not available; serving catalog file only`
    );
  }

  mixers.set(broadcastId, entry);
}

export function setMixerTrack(broadcastId, audioUrl) {
  const entry = ensureEntry(broadcastId, { audioUrl: audioUrl || null });
  const listeners = entry.listeners;
  const micOn = entry.micOn;
  const mountPath = entry.mountPath;
  stopProcess(entry);
  entry.listeners = listeners;
  entry.micOn = micOn;
  entry.mountPath = mountPath;
  entry.audioUrl = audioUrl || null;
  if (hasFfmpeg() || icecastConfigured()) {
    entry.proc = spawnMixer(broadcastId, entry);
    ensureSilencePump(broadcastId, entry);
  }
}

export function writeMixerPcm(broadcastId, buffer) {
  const entry = mixers.get(broadcastId);
  if (!entry?.proc?.stdin || entry.proc.stdin.destroyed) return;
  try {
    entry.proc.stdin.write(buffer);
  } catch {
    /* ignore backpressure / closed pipe */
  }
}

export function setMixerMic(broadcastId, micOn) {
  const entry = ensureEntry(broadcastId);
  entry.micOn = Boolean(micOn);
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
  mixers.delete(broadcastId);
}

export function isMixerConfigured() {
  return icecastConfigured();
}

export function ensureMixer(broadcastId, { mountPath, audioUrl = null } = {}) {
  const entry = mixers.get(Number(broadcastId));
  if (entry?.proc && !entry.proc.killed) {
    if (audioUrl && audioUrl !== entry.audioUrl) {
      setMixerTrack(broadcastId, audioUrl);
    }
    return;
  }
  startMixer(broadcastId, { mountPath, audioUrl });
}

export function hasLiveMixer(broadcastId) {
  const entry = mixers.get(Number(broadcastId));
  return Boolean(entry?.proc && !entry.proc.killed);
}

export function attachLiveMp3Listener(broadcastId, req, res) {
  const id = Number(broadcastId);
  let entry = mixers.get(id);
  if (!entry?.proc && (hasFfmpeg() || icecastConfigured())) {
    startMixer(id, {
      mountPath: entry?.mountPath,
      audioUrl: entry?.audioUrl,
    });
    entry = mixers.get(id);
  }
  if (!entry?.proc) return false;

  res.statusCode = 200;
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
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
