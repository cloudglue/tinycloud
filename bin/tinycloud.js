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

/**
 * pickVersion() for advisory uses (prune-protect lists): a malformed
 * TINYCLOUD_VERSION should fail the run path loudly, but it must not crash
 * an install/update that never needed it.
 */
function pickVersionSafe() {
  try {
    return pickVersion();
  } catch {
    return null;
  }
}

async function cmdInstall(args, target) {
  let version = null;
  let latest = false;
  let prune = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--version" && args[i + 1]) version = normalizeVersion(args[++i]);
    else if (args[i] === "--latest") latest = true;
    else if (args[i] === "--prune") prune = true;
    else throw new Error(`Unknown install option: ${args[i]} (expected --version <v>, --latest, or --prune)`);
  }
  if (latest && version) throw new Error("install options --version and --latest cannot be used together");
  if (prune && (latest || version)) {
    // Combining an install spec with --prune is ambiguous (two Bugbot
    // findings pulled opposite ways here): --prune is standalone cache
    // maintenance. `tinycloud update` is install-latest-and-prune.
    throw new Error(
      "--prune is a standalone action: run the install first, then `tinycloud install --prune` (or use `tinycloud update`)"
    );
  }
  if (prune) {
    // Protect what the run path resolves to (env pin / wrapper-version /
    // package default). A "latest" pin is resolved to its concrete version —
    // the literal string would never match a versions/<semver>/ cache dir,
    // leaving the tree latest actually runs unprotected.
    let protect = [pickVersionSafe()].filter(Boolean);
    if (protect.includes("latest")) {
      const manifest = await fetchManifest().catch(() => null);
      const stable = manifest && manifest.channels && manifest.channels.stable;
      const resolved = stable ? normalizeVersion(stable) : null;
      protect = protect.map((p) => (p === "latest" ? resolved : p)).filter(Boolean);
      if (!resolved) {
        process.stderr.write(
          "tinycloud: cannot resolve the 'latest' pin without the release manifest — pruning by age only\n"
        );
      }
    }
    const removed = pruneVersions(2, protect);
    console.log(removed.length ? `Pruned: ${removed.join(", ")}` : "Nothing to prune.");
    return;
  }
  // An explicit --version wins without consulting the env/override, so a
  // malformed TINYCLOUD_VERSION can't block an explicit install.
  if (!version && !latest) version = pickVersion();
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
  // (e.g. a TINYCLOUD_VERSION env pin). Advisory only — a malformed env
  // value must not fail an update that already completed. A "latest" pin
  // resolves to the stable we just installed.
  const pinned = pickVersionSafe();
  const removed = pruneVersions(2, [res.version, pinned === "latest" ? res.version : pinned].filter(Boolean));
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
