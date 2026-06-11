"use strict";

const { execFileSync } = require("node:child_process");

const DEFAULT_BASE = "https://media.cloudglue.dev/tinycloud-dist";

// Node's fetch ignores proxy env vars; shell out to curl when one is set so
// the manifest/sidecar fetches behave like the tarball download (and like
// install.sh, which always uses curl).
function useCurl() {
  return !!(process.env.HTTPS_PROXY || process.env.https_proxy || process.env.TINYCLOUD_USE_CURL === "1");
}

/** GET url → {status, text}. status 0 = network failure. Proxy-aware. */
async function httpGetText(url) {
  if (useCurl()) {
    try {
      const out = execFileSync("curl", ["-sSL", "-w", "\n%{http_code}", url], { encoding: "utf8" });
      const i = out.lastIndexOf("\n");
      return { status: Number(out.slice(i + 1).trim()) || 0, text: out.slice(0, i) };
    } catch {
      return { status: 0, text: "" };
    }
  }
  try {
    const res = await fetch(url);
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch {
    return { status: 0, text: "" };
  }
}

/** HEAD url → ETag header value or null. Proxy-aware. */
async function httpHeadEtag(url) {
  if (useCurl()) {
    try {
      const out = execFileSync("curl", ["-sSIL", url], { encoding: "utf8" });
      const m = out.match(/^etag:\s*(.+)$/im);
      return m ? m[1].trim() : null;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok ? res.headers.get("etag") : null;
  } catch {
    return null;
  }
}

function baseUrl() {
  return (process.env.TINYCLOUD_DIST_URL || DEFAULT_BASE).replace(/\/+$/, "");
}

function requireManifest() {
  return process.env.TINYCLOUD_REQUIRE_MANIFEST === "1";
}

// Pinned tarballs on the CDN are v-prefixed (tinycloud-<platform>-v0.3.0.tar.gz);
// version strings stay bare everywhere else.
function tarballName(target, version) {
  return version ? `tinycloud-${target}-v${version}.tar.gz` : `tinycloud-${target}.tar.gz`;
}

/**
 * The manifest is an optimization, never a requirement (unless strict mode):
 * a missing, erroring, or unusable manifest (CloudFront 403-for-missing,
 * 5xx, captive-portal HTML, future schema) degrades to null so commands
 * that don't need it keep working. Checksum MISMATCHES still always fail.
 */
async function fetchManifest() {
  const url = `${baseUrl()}/manifest.json`;
  const degrade = (reason) => {
    if (requireManifest()) {
      throw new Error(`TINYCLOUD_REQUIRE_MANIFEST=1 but the release manifest is unavailable: ${reason}`);
    }
    return null;
  };
  const { status, text } = await httpGetText(url);
  if (status === 0 || status === 403 || status === 404) {
    return degrade(`${url} is missing (HTTP ${status || "network error"})`);
  }
  if (status !== 200) {
    process.stderr.write(`tinycloud: fetching ${url} failed (HTTP ${status}); proceeding without it\n`);
    return degrade(`HTTP ${status}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    process.stderr.write(`tinycloud: ${url} is not valid JSON; proceeding without it\n`);
    return degrade("invalid JSON");
  }
  if (manifest.schema !== 1) {
    process.stderr.write(
      `tinycloud: unsupported manifest schema ${manifest.schema} at ${url}; proceeding without it (upgrade @cloudglue/tinycloud)\n`
    );
    return degrade(`unsupported schema ${manifest.schema}`);
  }
  return manifest;
}

/** Try the <tarball>.sha256 sidecar; returns the hex hash or null. */
async function fetchSidecarSha256(tarballUrl) {
  const { status, text } = await httpGetText(`${tarballUrl}.sha256`);
  if (status !== 200) return null;
  const match = text.trim().match(/^[0-9a-f]{64}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Resolve a version request to a concrete download.
 * @param {string} versionOrLatest exact semver, or "latest"
 * @param {string} channel "stable" | "beta"
 * @param {string} target platform key like "darwin-arm64"
 * @returns {{version: string|null, url: string, sha256: string|null, size: number|null, verified: boolean}}
 */
async function resolveDownload(versionOrLatest, channel, target, prefetchedManifest) {
  // Callers that already fetched the manifest (update / install --latest)
  // pass it in to avoid a second network round-trip for the same JSON.
  const manifest = prefetchedManifest !== undefined ? prefetchedManifest : await fetchManifest();
  const base = baseUrl();

  if (manifest) {
    let version = versionOrLatest;
    const userPinned = versionOrLatest !== "latest";
    if (versionOrLatest === "latest") {
      version = manifest.channels && manifest.channels[channel];
      if (!version) throw new Error(`Channel "${channel}" has no released version in the manifest`);
      // Manifest-resolved versions get the same leading-v normalization as
      // user input (install.sh does the same with ${VERSION#v})
      version = String(version).replace(/^v/, "");
    }
    const entry = manifest.versions && manifest.versions[version];
    const plat = entry && entry.platforms && entry.platforms[target];
    if (plat) {
      // An explicit distribution base (mirror, fixture) wins over the
      // manifest's absolute URLs — otherwise the override only redirects
      // the manifest fetch while tarballs still hit the canonical CDN.
      const url = process.env.TINYCLOUD_DIST_URL ? `${base}/${plat.url.split("/").pop()}` : plat.url;
      return { version, url, sha256: plat.sha256 || null, size: plat.size || null, verified: !!plat.sha256 };
    }
    if (!userPinned || requireManifest()) {
      throw new Error(
        entry ? `Version ${version} has no build for ${target}` : `Version ${version} not found in the release manifest`
      );
    }
    // A user-pinned version missing from the manifest (e.g. a pre-manifest
    // release whose tarball is still on the CDN) falls back to the
    // conventional URL + sidecar instead of hard-failing.
    process.stderr.write(`tinycloud: version ${version} is not in the release manifest; trying the direct URL\n`);
    const url = `${base}/${tarballName(target, version)}`;
    const sha256 = await fetchSidecarSha256(url);
    return { version, url, sha256, size: null, verified: !!sha256 };
  }

  // No manifest published: fall back to direct tarball URLs.
  if (channel !== "stable") {
    throw new Error(`Channel "${channel}" requires the release manifest, which is not available`);
  }
  const version = versionOrLatest === "latest" ? null : versionOrLatest;
  const url = `${base}/${tarballName(target, version)}`;
  const sha256 = await fetchSidecarSha256(url);
  if (!sha256) {
    process.stderr.write(
      "tinycloud: release manifest and checksum sidecar not found — proceeding without checksum verification\n"
    );
  }
  return { version, url, sha256, size: null, verified: !!sha256 };
}

module.exports = {
  baseUrl,
  fetchManifest,
  fetchSidecarSha256,
  resolveDownload,
  tarballName,
  httpHeadEtag,
  DEFAULT_BASE,
};
