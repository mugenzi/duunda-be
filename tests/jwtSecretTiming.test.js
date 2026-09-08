/** @format */

import assert from "node:assert/strict";
import { test } from "node:test";
import jwt from "jsonwebtoken";

function jwtSecret() {
  return process.env.JWT_SECRET || "fallback_secret";
}

test("broadcast auth must verify with the secret present at request time", () => {
  const previous = process.env.JWT_SECRET;
  try {
    delete process.env.JWT_SECRET;
    const snapshotAtImport = process.env.JWT_SECRET || "fallback_secret";
    assert.equal(snapshotAtImport, "fallback_secret");

    process.env.JWT_SECRET = "runtime_secret_after_dotenv";
    const loginToken = jwt.sign({ userId: 1, username: "host" }, process.env.JWT_SECRET);

    assert.doesNotThrow(() => jwt.verify(loginToken, jwtSecret()));
    assert.throws(() => jwt.verify(loginToken, snapshotAtImport));
  } finally {
    if (previous === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous;
    }
  }
});

test("fallback_secret tokens are rejected once JWT_SECRET is loaded", () => {
  const previous = process.env.JWT_SECRET;
  try {
    process.env.JWT_SECRET = "runtime_secret_after_dotenv";
    const stale = jwt.sign({ userId: 1 }, "fallback_secret");
    assert.throws(() => jwt.verify(stale, jwtSecret()));
  } finally {
    if (previous === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previous;
    }
  }
});
