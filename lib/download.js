"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");

function fmtMB(bytes) {
  return (bytes / 1048576).toFixed(1);
}

function sha256File(path) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(path));
  return hash.digest("hex");
}

/**
 * Download a URL to a file, computing sha256 in the same pass. Shows progress
 * on stderr when it's a TTY. Node's fetch ignores proxy env vars, so when an
 * HTTPS proxy is configured we shell out to curl instead.
 * @returns {Promise<string>} sha256 hex of the downloaded bytes
 */
async function downloadWithHash(url, destPath) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy || process.env.TINYCLOUD_USE_CURL === "1") {
    execFileSync("curl", ["-fsSL", "-o", destPath, url], { stdio: ["ignore", "ignore", "inherit"] });
    return sha256File(destPath);
  }

  const res = await fetch(url);
  if (res.status === 403 || res.status === 404) {
    throw new Error(`Download not found: ${url} (HTTP ${res.status}) — the requested version may not be published`);
  }
  if (!res.ok || !res.body) throw new Error(`Download failed: ${url} (HTTP ${res.status})`);

  const total = Number(res.headers.get("content-length")) || 0;
  const hash = crypto.createHash("sha256");
  const out = fs.createWriteStream(destPath);
  const showProgress = process.stderr.isTTY;
  let received = 0;
  let lastRender = 0;

  const source = Readable.fromWeb(res.body);
  source.on("data", (chunk) => {
    hash.update(chunk);
    received += chunk.length;
    const now = Date.now();
    if (showProgress && now - lastRender > 250) {
      lastRender = now;
      const pct = total ? ` (${Math.floor((received / total) * 100)}%)` : "";
      process.stderr.write(`\rtinycloud: downloading ${fmtMB(received)}/${total ? fmtMB(total) : "?"} MB${pct}`);
    }
  });
  await pipeline(source, out);
  if (showProgress) process.stderr.write("\n");
  return hash.digest("hex");
}

module.exports = { downloadWithHash, sha256File };
