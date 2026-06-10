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
  let version = pkg.version;
  let latest = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) version = normalizeVersion(args[++i]);
    else if (args[i] === "--latest") latest = true;
    else if (args[i] === "--prune") {
      const removed = pruneVersions(2, [pickVersion()]);
      console.log(removed.length ? `Pruned: ${removed.join(", ")}` : "Nothing to prune.");
      return;
    } else throw new Error(`Unknown install option: ${args[i]} (expected --version <v>, --latest, or --prune)`);
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
  const alreadyCurrent = isInstalled(version);
  const res = await ensureInstalled(version, target);
  writeOverrideVersion(res.version);
  const removed = pruneVersions(2, [res.version]);
  console.log(
    alreadyCurrent
      ? `tinycloud ${res.version} is already current (${res.dir})`
      : `tinycloud updated to ${res.version} (${res.dir})`
  );
  if (removed.length) console.log(`Pruned old versions: ${removed.join(", ")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const target = resolveTarget();

  // Wrapper-owned subcommands. The binary has no install/update/skills
  // verbs; these names are reserved with the binary owners (guarded by a
  // regression test in the source repo).
  if (args[0] === "install") return cmdInstall(args.slice(1), target);
  if (args[0] === "update") return cmdUpdate(target);
  if (args[0] === "skills") return cmdSkills(args.slice(1));

  const { dir } = await ensureInstalled(pickVersion(), target);
  run(path.join(dir, "tinycloud"), args, dir);
}

main().catch((err) => {
  process.stderr.write(`tinycloud: ${err.message}\n`);
  process.exit(typeof err.exitCode === "number" ? err.exitCode : 1);
});
