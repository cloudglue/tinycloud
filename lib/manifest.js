"use strict";

const DEFAULT_BASE = "https://media.cloudglue.dev/tinycloud-dist";

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
 * Fetch manifest.json from the distribution endpoint. Returns null when it
 * does not exist. CloudFront serves 403 for missing S3 keys, so 403 and 404
 * both mean "missing".
 */
async function fetchManifest() {
  const url = `${baseUrl()}/manifest.json`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    if (requireManifest()) {
      throw new Error(`TINYCLOUD_REQUIRE_MANIFEST=1 but fetching ${url} failed: ${err.message}`);
    }
    return null;
  }
  if (res.status === 403 || res.status === 404) {
    if (requireManifest()) {
      throw new Error(`TINYCLOUD_REQUIRE_MANIFEST=1 but ${url} is missing (HTTP ${res.status})`);
    }
    return null;
  }
  if (!res.ok) throw new Error(`Fetching ${url} failed: HTTP ${res.status}`);
  const manifest = await res.json();
  if (manifest.schema !== 1) {
    throw new Error(`Unsupported manifest schema ${manifest.schema} at ${url} — upgrade @cloudglue/tinycloud`);
  }
  return manifest;
}

/** Try the <tarball>.sha256 sidecar; returns the hex hash or null. */
async function fetchSidecarSha256(tarballUrl) {
  let res;
  try {
    res = await fetch(`${tarballUrl}.sha256`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const text = (await res.text()).trim();
  const match = text.match(/^[0-9a-f]{64}/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Resolve a version request to a concrete download.
 * @param {string} versionOrLatest exact semver, or "latest"
 * @param {string} channel "stable" | "beta"
 * @param {string} target platform key like "darwin-arm64"
 * @returns {{version: string|null, url: string, sha256: string|null, size: number|null, verified: boolean}}
 */
async function resolveDownload(versionOrLatest, channel, target) {
  const manifest = await fetchManifest();
  const base = baseUrl();

  if (manifest) {
    let version = versionOrLatest;
    if (versionOrLatest === "latest") {
      version = manifest.channels && manifest.channels[channel];
      if (!version) throw new Error(`Channel "${channel}" has no released version in the manifest`);
    }
    const entry = manifest.versions && manifest.versions[version];
    if (!entry) throw new Error(`Version ${version} not found in the release manifest`);
    const plat = entry.platforms && entry.platforms[target];
    if (!plat) throw new Error(`Version ${version} has no build for ${target}`);
    return { version, url: plat.url, sha256: plat.sha256 || null, size: plat.size || null, verified: !!plat.sha256 };
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

module.exports = { baseUrl, fetchManifest, fetchSidecarSha256, resolveDownload, tarballName, DEFAULT_BASE };
