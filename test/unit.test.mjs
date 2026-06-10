import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveTarget, PlatformError } = require("../lib/platform.js");
const { tarballName, baseUrl, DEFAULT_BASE } = require("../lib/manifest.js");

test("resolveTarget maps supported platforms", () => {
  assert.equal(resolveTarget("darwin", "arm64"), "darwin-arm64");
  assert.equal(resolveTarget("darwin", "x64"), "darwin-x64");
  assert.equal(resolveTarget("linux", "x64"), "linux-x64");
  assert.equal(resolveTarget("linux", "arm64"), "linux-arm64");
  assert.equal(resolveTarget("linux", "aarch64"), "linux-arm64");
});

test("resolveTarget rejects windows with WSL2 guidance", () => {
  assert.throws(() => resolveTarget("win32", "x64"), (err) => {
    assert.ok(err instanceof PlatformError);
    assert.match(err.message, /WSL2/);
    return true;
  });
});

test("resolveTarget rejects unknown platforms", () => {
  assert.throws(() => resolveTarget("sunos", "x64"), /Unsupported platform: sunos-x64/);
});

test("tarballName builds latest and pinned names", () => {
  assert.equal(tarballName("darwin-arm64", null), "tinycloud-darwin-arm64.tar.gz");
  assert.equal(tarballName("linux-x64", "0.3.0"), "tinycloud-linux-x64-0.3.0.tar.gz");
});

test("baseUrl honors TINYCLOUD_DIST_URL and strips trailing slash", () => {
  const prev = process.env.TINYCLOUD_DIST_URL;
  try {
    delete process.env.TINYCLOUD_DIST_URL;
    assert.equal(baseUrl(), DEFAULT_BASE);
    process.env.TINYCLOUD_DIST_URL = "http://127.0.0.1:9999/";
    assert.equal(baseUrl(), "http://127.0.0.1:9999");
  } finally {
    if (prev === undefined) delete process.env.TINYCLOUD_DIST_URL;
    else process.env.TINYCLOUD_DIST_URL = prev;
  }
});
