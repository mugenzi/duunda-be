/** @format */

import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { test } from "node:test";
import {
  buildMixerArgs,
  mixerTrackPath,
  writeMixerTrackFile,
} from "../services/broadcastMixer.js";

test("mixer reads a local looping track and probes stdin immediately", () => {
  const trackPath = path.join(os.tmpdir(), "duunda-mixer-args-test.mp3");
  fs.writeFileSync(trackPath, Buffer.from([0xff, 0xfb, 0x90, 0x00]));
  const args = buildMixerArgs({ trackPath });
  const pipeAt = args.lastIndexOf("pipe:0");
  const probeAt = args.lastIndexOf("-probesize");
  assert.ok(args.includes("-stream_loop"));
  assert.ok(args.includes(trackPath));
  assert.equal(args.includes("http://www.assyncs.com:3000/api/music/tracks/1"), false);
  assert.ok(probeAt >= 0 && probeAt < pipeAt);
  assert.equal(args[probeAt + 1], "32");
  fs.unlinkSync(trackPath);
});

test("mixer writes catalog bytes next to a per-broadcast temp file", () => {
  const dest = writeMixerTrackFile(42, Buffer.from("ID3"));
  assert.equal(dest, mixerTrackPath(42));
  assert.equal(fs.readFileSync(dest, "utf8"), "ID3");
  fs.unlinkSync(dest);
});
