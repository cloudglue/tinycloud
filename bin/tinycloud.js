#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { resolveTarget } = require("../lib/platform");
const {
  ensureInstalled,
  pruneVersions,
  readOverrideVersion,
  writeOverrideVersion,
  normalizeVersion,
  isInstalled,
} = require("../lib/installer");
const { fetchManifest } = require("../lib/manifest");
const { cmdSkills } = require("../lib/skills");
const { run } = require("../lib/run");
const pkg = require("../package.json");

function pickVersion() {
  return normalizeVersion(process.env.TINYCLOUD_VERSION || readOverrideVersion() || pkg.version);
}

async function cmdInstall(args, target) {
  let version = pickVersion(); // honor TINYCLOUD_VERSION / wrapper-version, like the run path
  let explicitVersion = false;
  let latest = false;
  let prune = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) {
      explicitVersion = true;
      version = normalizeVersion(args[++i]);
    } else if (args[i] === "--latest") latest = true;
    else if (args[i] === "--prune") prune = true;
    else throw new Error(`Unknown install option: ${args[i]} (expected --version <v>, --latest, or --prune)`);
  }
  if (latest && explicitVersion) throw new Error("install options --version and --latest cannot be used together");
  if (prune) {
    // Parsed after the full arg loop so `install --version X --prune`
    // protects X as well as the run path's pinned version.
    const removed = pruneVersions(2, [version, pickVersion()]);
    console.log(removed.length ? `Pruned: ${removed.join(", ")}` : "Nothing to prune.");
    return;
  }
  if (latest) {
    const manifest = await fetchManifest();
    if (!manifest) throw new Error("`install --latest` requires the release manifest, which is not available");
    version = manifest.channels && manifest.channels.stable;
    if (!version) throw new Error("The release manifest has no stable version");
  }
  const res = await ensureInstalled(version, target);
  if (latest) writeOverrideVersion(res.version);
  console.log(`tinycloud ${res.version} installed at ${res.dir}`);
}

async function cmdUpdate(target) {
  const manifest = await fetchManifest();
  if (!manifest) throw new Error("`update` requires the release manifest, which is not available");
  const version = normalizeVersion(manifest.channels && manifest.channels.stable);
  if (!version) throw new Error("The release manifest has no stable version");
  const alreadyCurrent = isInstalled(version, target);
  const res = await ensureInstalled(version, target);
  writeOverrideVersion(res.version);
  // Protect both the new stable and whatever the run path still resolves to
  // (e.g. a TINYCLOUD_VERSION env pin).
  const removed = pruneVersions(2, [res.version, pickVersion()]);
  console.log(
    alreadyCurrent
      ? `tinycloud ${res.version} is already current (${res.dir})`
      : `tinycloud updated to ${res.version} (${res.dir})`
  );
  if (removed.length) console.log(`Pruned old versions: ${removed.join(", ")}`);
}

async function main() {
  const args = process.argv.slice(2);

  // Wrapper-owned subcommands. The binary has no install/update/skills
  // verbs; these names are reserved with the binary owners (guarded by a
  // regression test in the source repo). `skills` only copies bundled
  // files, so it dispatches before the platform gate (works on Windows).
  if (args[0] === "skills") return cmdSkills(args.slice(1));

  const target = resolveTarget();
  if (args[0] === "install") return cmdInstall(args.slice(1), target);
  if (args[0] === "update") return cmdUpdate(target);

  const { dir } = await ensureInstalled(pickVersion(), target);
  run(path.join(dir, "tinycloud"), args, dir);
}

main().catch((err) => {
  process.stderr.write(`tinycloud: ${err.message}\n`);
  process.exit(typeof err.exitCode === "number" ? err.exitCode : 1);
});
