/** @format */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  broadcastListenPath,
  catalogTrackListenUrl,
  resolveListenUrl,
  toPublicHttpsUrl,
} from "../services/broadcastListenUrl.js";

test("rewrites insecure catalog URLs to the public HTTPS origin", () => {
  assert.equal(
    toPublicHttpsUrl("http://www.assyncs.com:3000/api/music/tracks/1"),
    "https://assyncs.com/api/music/tracks/1"
  );
  assert.equal(
    toPublicHttpsUrl("https://assyncs.com/api/music/tracks/13"),
    "https://assyncs.com/api/music/tracks/13"
  );
});

test("music-only listen URL is listen.mp3, not radio.duunda.com or jpeg tracks", () => {
  assert.equal(
    resolveListenUrl({
      icecastConfigured: false,
      mountListenUrl: "https://radio.duunda.com/live/5.mp3",
      broadcastId: 5,
      trackId: 1,
      audioUrl: "http://www.assyncs.com:3000/api/music/tracks/1",
    }),
    "https://assyncs.com/api/broadcasts/5/listen.mp3?t=1"
  );
  assert.equal(
    resolveListenUrl({
      icecastConfigured: false,
      mountListenUrl: "https://radio.duunda.com/live/5.mp3",
      broadcastId: 5,
      trackId: null,
      audioUrl: null,
    }),
    null
  );
  assert.equal(
    broadcastListenPath(5, 1),
    "https://assyncs.com/api/broadcasts/5/listen.mp3?t=1"
  );
  assert.equal(
    catalogTrackListenUrl(9, null),
    "https://assyncs.com/api/music/tracks/9"
  );
});

test("Icecast listen URL stays on the mount when the mixer is configured", () => {
  assert.equal(
    resolveListenUrl({
      icecastConfigured: true,
      mountListenUrl: "https://radio.duunda.com/live/5.mp3",
      broadcastId: 5,
      trackId: 1,
      audioUrl: "http://www.assyncs.com:3000/api/music/tracks/1",
    }),
    "https://radio.duunda.com/live/5.mp3"
  );
});
