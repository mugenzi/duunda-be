/** @format */

import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { sendAudioFile } from "../services/sendAudioFile.js";

function request(server, headers = {}) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http
      .get({ hostname: "127.0.0.1", port, path: "/", headers: { Connection: "close", ...headers } }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      })
      .on("error", reject);
  });
}

test("listen responses advertise audio/mpeg and honor Range", async () => {
  const payload = Buffer.from("ID3FAKEAUDIO");
  const server = http.createServer((req, res) => sendAudioFile(req, res, payload));
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const full = await request(server);
    assert.equal(full.status, 200);
    assert.equal(full.headers["content-type"], "audio/mpeg");
    assert.equal(full.headers["accept-ranges"], "bytes");
    assert.equal(full.body.toString(), "ID3FAKEAUDIO");

    const ranged = await request(server, { Range: "bytes=0-2" });
    assert.equal(ranged.status, 206);
    assert.equal(ranged.headers["content-range"], "bytes 0-2/12");
    assert.equal(ranged.body.toString(), "ID3");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
