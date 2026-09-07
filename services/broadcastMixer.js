/** @format */

import { spawn } from "child_process";

const mixers = new Map();

function icecastConfigured() {
  return Boolean(process.env.ICECAST_HOST && process.env.ICECAST_SOURCE_PASSWORD);
}

function icecastOutput(mountPath) {
  const user = process.env.ICECAST_SOURCE_USER || "source";
  const pass = process.env.ICECAST_SOURCE_PASSWORD;
  const host = process.env.ICECAST_HOST;
  const port = process.env.ICECAST_PORT || "8000";
  const mount = mountPath.startsWith("/") ? mountPath : `/${mountPath}`;
  return `icecast://${user}:${pass}@${host}:${port}${mount}`;
}

function stopProcess(entry) {
  if (!entry?.proc) return;
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

function spawnMixer(broadcastId, { audioUrl, mountPath }) {
  if (!icecastConfigured()) {
    return null;
  }

  const output = icecastOutput(mountPath);
  const args = ["-hide_banner", "-loglevel", "error"];

  if (audioUrl) {
    args.push("-re", "-i", audioUrl);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }

  args.push(
    "-f",
    "s16le",
    "-ar",
    "44100",
    "-ac",
    "1",
    "-i",
    "pipe:0",
    "-filter_complex",
    "[0:a][1:a]amix=inputs=2:duration=longest:dropout_transition=2[a]",
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-f",
    "mp3",
    output
  );

  const proc = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, {
    stdio: ["pipe", "ignore", "pipe"],
  });

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

export function startMixer(broadcastId, { mountPath, audioUrl = null } = {}) {
  const prev = mixers.get(broadcastId);
  stopProcess(prev);

  const entry = {
    mountPath,
    audioUrl: audioUrl || null,
    micOn: false,
    proc: null,
  };

  if (icecastConfigured()) {
    entry.proc = spawnMixer(broadcastId, entry);
  } else {
    console.log(
      `[broadcast mixer ${broadcastId}] Icecast/FFmpeg not configured; using listen URL stub`
    );
  }

  mixers.set(broadcastId, entry);
}

export function setMixerTrack(broadcastId, audioUrl) {
  const entry = mixers.get(broadcastId);
  if (!entry) return;
  entry.audioUrl = audioUrl || null;
  stopProcess(entry);
  if (icecastConfigured()) {
    entry.proc = spawnMixer(broadcastId, entry);
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
  const entry = mixers.get(broadcastId);
  if (entry) {
    entry.micOn = Boolean(micOn);
  }
}

export function stopMixer(broadcastId) {
  const entry = mixers.get(broadcastId);
  stopProcess(entry);
  mixers.delete(broadcastId);
}

export function isMixerConfigured() {
  return icecastConfigured();
}
