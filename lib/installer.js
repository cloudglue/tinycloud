"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { resolveDownload } = require("./manifest");
const { downloadWithHash } = require("./download");

function rootDir() {
  return process.env.TINYCLOUD_INSTALL_DIR || path.join(os.homedir(), ".tinycloud");
}

function versionDir(version) {
  return path.join(rootDir(), "versions", version);
}

function overrideFile() {
  return path.join(rootDir(), "wrapper-version");
}

function readOverrideVersion() {
  try {
    const v = fs.readFileSync(overrideFile(), "utf8").trim();
    return v || null;
  } catch {
    return null;
  }
}

function writeOverrideVersion(version) {
  fs.mkdirSync(rootDir(), { recursive: true });
  fs.writeFileSync(overrideFile(), version + "\n");
}

/**
 * Ensure the given version is installed under <root>/versions/<version>.
 * Returns the install dir. Concurrency-safe via extract-then-atomic-rename:
 * a half-extracted directory never carries the .ok marker, and a lost rename
 * race just means another process won.
 *
 * @param {string} version exact semver, or "latest" (resolved via manifest
 *   when available; the latest alias tarball otherwise)
 * @returns {Promise<{dir: string, version: string}>}
 */
async function ensureInstalled(version, target) {
  if (version !== "latest") {
    const dest = versionDir(version);
    if (fs.existsSync(path.join(dest, ".ok"))) return { dir: dest, version };
  }

  const res = await resolveDownload(version, "stable", target);
  if (res.version) {
    const dest = versionDir(res.version);
    if (fs.existsSync(path.join(dest, ".ok"))) return { dir: dest, version: res.version };
  }

  const root = rootDir();
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, "tmp", "dl-"));
  try {
    const tarball = path.join(stage, "tinycloud.tar.gz");
    process.stderr.write(`tinycloud: fetching ${res.url}\n`);
    const actual = await downloadWithHash(res.url, tarball);
    if (res.sha256 && actual !== res.sha256.toLowerCase()) {
      throw new Error(
        `Checksum mismatch for ${res.url}\n  expected ${res.sha256}\n  actual   ${actual}\n` +
          "Refusing to install. Retry, or report to Cloudglue if it persists."
      );
    }

    const extracted = path.join(stage, "x");
    fs.mkdirSync(extracted);
    execFileSync("tar", ["-xzf", tarball, "-C", extracted]);
    const binPath = path.join(extracted, "tinycloud");
    if (!fs.existsSync(binPath)) throw new Error("Downloaded tarball is missing the ./tinycloud binary");

    // Resolve "latest" with no manifest: ask the binary itself.
    let version_ = res.version;
    if (!version_) {
      const out = execFileSync(binPath, ["--version", "--json"], { encoding: "utf8" });
      version_ = JSON.parse(out).version;
    }

    fs.writeFileSync(
      path.join(extracted, ".ok"),
      JSON.stringify({ version: version_, sha256: actual, verified: !!res.sha256, url: res.url }) + "\n"
    );
    const dest = versionDir(version_);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(extracted, dest);
    } catch (err) {
      if (!fs.existsSync(path.join(dest, ".ok"))) throw err; // lost the race → other process won
    }
    return { dir: dest, version: version_ };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** Keep the newest `keep` installed versions; remove the rest. */
function pruneVersions(keep = 2) {
  const dir = path.join(rootDir(), "versions");
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const sorted = entries
    .filter((e) => fs.existsSync(path.join(dir, e, ".ok")))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const removed = sorted.slice(0, Math.max(0, sorted.length - keep));
  for (const v of removed) fs.rmSync(path.join(dir, v), { recursive: true, force: true });
  return removed;
}

module.exports = {
  rootDir,
  versionDir,
  ensureInstalled,
  pruneVersions,
  readOverrideVersion,
  writeOverrideVersion,
};
