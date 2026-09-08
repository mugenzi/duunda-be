/** @format */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
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

test("music-only listen URL is the catalog track, not radio.duunda.com", () => {
  assert.equal(
    resolveListenUrl({
      icecastConfigured: false,
      mountListenUrl: "https://radio.duunda.com/live/5.mp3",
      trackId: 1,
      audioUrl: "http://www.assyncs.com:3000/api/music/tracks/1",
    }),
    "https://assyncs.com/api/music/tracks/1"
  );
  assert.equal(
    resolveListenUrl({
      icecastConfigured: false,
      mountListenUrl: "https://radio.duunda.com/live/5.mp3",
      trackId: null,
      audioUrl: null,
    }),
    null
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
      trackId: 1,
      audioUrl: "http://www.assyncs.com:3000/api/music/tracks/1",
    }),
    "https://radio.duunda.com/live/5.mp3"
  );
});
