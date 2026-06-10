#!/usr/bin/env node
// Maintainer tool: build/merge the tinycloud release manifest and per-tarball
// .sha256 sidecars, or verify the live CDN against the live manifest.
//
// Usage:
//   node scripts/generate-manifest.mjs --version 0.3.0 --dir ./artifacts [--channel stable] [--out ./out]
//   node scripts/generate-manifest.mjs --version 0.3.0 --from-cdn [--out ./out]
//   node scripts/generate-manifest.mjs --check [--version 0.3.0]
//
// --dir       directory containing the 4 platform tarballs (tinycloud-<platform>-<version>.tar.gz)
// --from-cdn  hash the already-uploaded pinned tarballs instead of local files
// --check     verify every manifest URL (or just one version's) downloads and
//             matches its recorded sha256/size; exit non-zero on drift
//
// This tool never uploads; it prints the aws s3 cp commands to run.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"];
const BASE = (process.env.TINYCLOUD_DIST_URL || "https://media.cloudglue.dev/tinycloud-dist").replace(/\/+$/, "");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(name);
const fail = (msg) => {
  console.error(`generate-manifest: ${msg}`);
  process.exit(1);
};

async function fetchManifest() {
  const res = await fetch(`${BASE}/manifest.json`);
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) fail(`fetching manifest.json failed: HTTP ${res.status}`);
  return res.json();
}

async function hashUrl(url) {
  const res = await fetch(url);
  if (!res.ok) fail(`download failed: ${url} (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { sha256: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

function hashFile(file) {
  const buf = fs.readFileSync(file);
  return { sha256: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length };
}

async function check() {
  const manifest = await fetchManifest();
  if (!manifest) fail(`manifest.json not found at ${BASE}/manifest.json`);
  const onlyVersion = arg("--version");
  const versions = onlyVersion ? [onlyVersion] : Object.keys(manifest.versions || {});
  if (onlyVersion && !(manifest.versions || {})[onlyVersion]) {
    fail(`version ${onlyVersion} not present in the live manifest`);
  }
  let bad = 0;
  for (const v of versions) {
    const platforms = manifest.versions[v].platforms || {};
    for (const [plat, info] of Object.entries(platforms)) {
      const actual = await hashUrl(info.url);
      const ok = actual.sha256 === info.sha256 && (!info.size || actual.size === info.size);
      console.log(`${ok ? "OK  " : "FAIL"} ${v} ${plat} ${info.url}`);
      if (!ok) {
        bad++;
        console.log(`     expected sha256=${info.sha256} size=${info.size}`);
        console.log(`     actual   sha256=${actual.sha256} size=${actual.size}`);
      }
    }
  }
  if (bad) fail(`${bad} artifact(s) drifted from the manifest`);
  console.log("Manifest matches the CDN.");
}

async function generate() {
  const version = arg("--version") || fail("--version <semver> is required");
  const channel = arg("--channel", "stable");
  const outDir = arg("--out", "./out");
  const dir = arg("--dir");
  const fromCdn = has("--from-cdn");
  if (!dir && !fromCdn) fail("provide --dir <artifacts-dir> or --from-cdn");

  const existing = (await fetchManifest()) || { schema: 1, name: "tinycloud", channels: {}, versions: {} };
  if (existing.schema !== 1) fail(`live manifest has unsupported schema ${existing.schema}`);

  const platforms = {};
  const sidecars = [];
  for (const plat of PLATFORMS) {
    const name = `tinycloud-${plat}-v${version}.tar.gz`; // CDN pinned names are v-prefixed
    const url = `${BASE}/${name}`;
    let info;
    if (fromCdn) {
      console.error(`hashing ${url} ...`);
      info = await hashUrl(url);
    } else {
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) fail(`missing artifact: ${file}`);
      info = hashFile(file);
    }
    platforms[plat] = { url, size: info.size, sha256: info.sha256 };
    sidecars.push({ name: `${name}.sha256`, body: `${info.sha256}  ${name}\n` });
  }

  const manifest = {
    ...existing,
    schema: 1,
    name: "tinycloud",
    generated_at: new Date().toISOString(),
    channels: { stable: existing.channels?.stable ?? null, beta: existing.channels?.beta ?? null, ...existing.channels, [channel]: version },
    versions: {
      ...existing.versions,
      [version]: {
        released_at: existing.versions?.[version]?.released_at ?? new Date().toISOString(),
        channel,
        platforms,
      },
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  for (const s of sidecars) fs.writeFileSync(path.join(outDir, s.name), s.body);

  console.log(`Wrote ${manifestPath} and ${sidecars.length} sidecars.\n`);
  console.log("Upload with:");
  for (const s of sidecars) {
    console.log(`  aws s3 cp ${path.join(outDir, s.name)} s3://<bucket>/tinycloud-dist/${s.name}`);
  }
  console.log(`  aws s3 cp ${manifestPath} s3://<bucket>/tinycloud-dist/manifest.json`);
  console.log(`  aws cloudfront create-invalidation --distribution-id <id> --paths "/tinycloud-dist/manifest.json"`);
}

if (has("--check")) await check();
else await generate();
