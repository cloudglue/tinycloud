"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { resolveDownload, httpHeadEtag } = require("./manifest");
const { downloadWithHash } = require("./download");

function rootDir() {
  return process.env.TINYCLOUD_INSTALL_DIR || path.join(os.homedir(), ".tinycloud");
}

/**
 * Accept v-prefixed versions everywhere a version is taken ("v0.3.0" ==
 * "0.3.0"), and reject anything that isn't a plain version token — version
 * strings become cache directory names, so path separators or ".." would
 * escape ~/.tinycloud/versions.
 */
function normalizeVersion(version) {
  if (typeof version !== "string") return version;
  const v = version.replace(/^v/, "");
  if (v !== "latest" && !/^[0-9A-Za-z][0-9A-Za-z.+_-]*$/.test(v)) {
    throw new Error(`Invalid version "${version}" (expected a version like 0.3.0)`);
  }
  return v;
}

/**
 * Is this version installed — and, when `target` is given, installed for
 * this platform? A cache root synced across machines (network home, mounted
 * volume) can hold another OS/arch's extract under the same version.
 */
function isInstalled(version, target) {
  const okPath = path.join(versionDir(version), ".ok");
  if (!fs.existsSync(okPath)) return false;
  if (!hasExecutableBinary(versionDir(version))) return false;
  if (!target) return true;
  try {
    const meta = JSON.parse(fs.readFileSync(okPath, "utf8"));
    if (meta.target) return meta.target === target;
    // Older .ok files lack the target; the recorded URL embeds it.
    if (meta.url) return String(meta.url).includes(`tinycloud-${target}`);
    return true;
  } catch {
    return false;
  }
}

function versionDir(version) {
  return path.join(rootDir(), "versions", version);
}

function hasExecutableBinary(dir) {
  try {
    fs.accessSync(path.join(dir, "tinycloud"), fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function overrideFile() {
  return path.join(rootDir(), "wrapper-version");
}

/** Newest healthy cached install for this platform, or null. */
function findNewestHealthy(target) {
  const dir = path.join(rootDir(), "versions");
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const healthy = entries
    .filter((v) => isInstalled(v, target))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!healthy.length) return null;
  const version = healthy[healthy.length - 1];
  return { dir: path.join(dir, version), version };
}

/** Scan installed versions for a .ok recorded from the same URL + ETag. */
function findInstalledByUrlEtag(url, etag) {
  const dir = path.join(rootDir(), "versions");
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const v of entries) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, v, ".ok"), "utf8"));
      if (meta.url === url && meta.etag && meta.etag === etag && hasExecutableBinary(path.join(dir, v))) {
        return { dir: path.join(dir, v), version: v };
      }
    } catch {}
  }
  return null;
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
async function ensureInstalled(version, target, opts = {}) {
  version = normalizeVersion(version);
  if (version !== "latest") {
    if (isInstalled(version, target)) return { dir: versionDir(version), version };
  }

  try {
    return await resolveAndInstall(version, target, opts);
  } catch (err) {
    // "latest" means "the best you can give me": when resolution or the
    // download is unreachable but a healthy install is cached, run that
    // instead of failing — a warm laptop going offline shouldn't brick
    // `tinycloud --help`. Pinned versions and strict mode still fail.
    if (version === "latest" && process.env.TINYCLOUD_REQUIRE_MANIFEST !== "1") {
      const fallback = findNewestHealthy(target);
      if (fallback) {
        process.stderr.write(
          `tinycloud: could not resolve latest (${err.message.split("\n")[0]}); using cached ${fallback.version}\n`
        );
        return fallback;
      }
    }
    throw err;
  }
}

async function resolveAndInstall(version, target, opts = {}) {
  const res = await resolveDownload(version, "stable", target, opts.manifest);
  // Strict mode means verified-or-fail, not just manifest-present — same
  // rule as install.sh (e.g. a manifest entry without sha256).
  if (process.env.TINYCLOUD_REQUIRE_MANIFEST === "1" && !res.sha256) {
    throw new Error(`TINYCLOUD_REQUIRE_MANIFEST=1 but no checksum is available for ${res.url}`);
  }
  // Manifest-sourced version strings become cache dir names too — run them
  // through the same normalize/validate as user input.
  if (res.version) res.version = normalizeVersion(res.version);
  if (res.version) {
    if (isInstalled(res.version, target)) return { dir: versionDir(res.version), version: res.version };
  } else {
    // "latest" with no manifest: the alias tarball has no version attached,
    // but if its ETag matches a cached install of the same URL we can skip
    // the ~90MB re-download.
    const etag = await httpHeadEtag(res.url);
    if (etag) {
      const warm = findInstalledByUrlEtag(res.url, etag);
      if (warm) return warm;
    }
  }

  const root = rootDir();
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  const stage = fs.mkdtempSync(path.join(root, "tmp", "dl-"));
  try {
    const tarball = path.join(stage, "tinycloud.tar.gz");
    process.stderr.write(`tinycloud: fetching ${res.url}\n`);
    const { sha256: actual, etag } = await downloadWithHash(res.url, tarball);
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

    // Resolve "latest" with no manifest: ask the binary itself. stdin must be
    // closed and the call bounded — pre-0.3.0 binaries open an interactive
    // TUI on this invocation instead of printing JSON.
    let version_ = res.version;
    if (!version_) {
      let out;
      try {
        out = execFileSync(binPath, ["--version", "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 15000,
        });
        version_ = JSON.parse(out).version;
      } catch {
        throw new Error(
          "Downloaded binary did not report a machine-readable version (older than 0.3.0?) — refusing to install"
        );
      }
      if (!version_) throw new Error("Downloaded binary reported no version — refusing to install");
      version_ = normalizeVersion(version_); // binary-reported strings become dir names too
    }

    fs.writeFileSync(
      path.join(extracted, ".ok"),
      JSON.stringify({ version: version_, target, sha256: actual, verified: !!res.sha256, url: res.url, etag }) + "\n"
    );
    const dest = versionDir(version_);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      fs.renameSync(extracted, dest);
    } catch (err) {
      // A peer's completed install only counts if it's for THIS platform —
      // a wrong-platform extract under the same version is stale.
      if (!isInstalled(version_, target)) {
        if (fs.existsSync(dest)) {
          // Leftover from an interrupted install (dir present, no .ok):
          // clear it and claim the slot rather than failing forever. If a
          // concurrent peer completes between the .ok check and this swap,
          // we replace its install with our byte-identical extract of the
          // same checksum-verified tarball — a momentary swap, not
          // corruption (eliminating it entirely would need cross-process
          // locking, which isn't worth it for this window).
          fs.rmSync(dest, { recursive: true, force: true });
          fs.renameSync(extracted, dest);
        } else {
          throw err;
        }
      }
      // else: lost the race → another process completed the install
    }
    return { dir: dest, version: version_ };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/**
 * Keep the newest `keep` installed versions for THIS platform; remove the
 * rest. Versions in `protect` (e.g. the one the wrapper currently resolves
 * to) are never removed and don't count against `keep`. Broken entries (a
 * .ok marker but no runnable binary) are removed outright and never occupy
 * a retention slot. When `target` is given, healthy entries for OTHER
 * platforms (a shared/synced cache root) are left untouched and don't
 * count either — this machine's prune must not delete a peer machine's
 * builds, nor let them crowd out the only build that runs here.
 */
function pruneVersions(keep = 2, protect = [], target) {
  const dir = path.join(rootDir(), "versions");
  const protected_ = new Set(protect.map(normalizeVersion).filter(Boolean));
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const healthy = [];
  const broken = [];
  for (const e of entries) {
    // Dirs without .ok are crash leftovers; ensureInstalled reclaims those.
    if (!fs.existsSync(path.join(dir, e, ".ok"))) continue;
    if (protected_.has(e)) continue;
    if (!isInstalled(e)) {
      broken.push(e);
      continue;
    }
    if (target && !isInstalled(e, target)) continue; // peer platform's tree
    healthy.push(e);
  }
  healthy.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const removed = [...broken, ...healthy.slice(0, Math.max(0, healthy.length - keep))];
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
  normalizeVersion,
  isInstalled,
};
