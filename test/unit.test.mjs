import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveTarget, PlatformError } = require("../lib/platform.js");
const { tarballName, baseUrl, DEFAULT_BASE } = require("../lib/manifest.js");
const { normalizeVersion, pruneVersions, isInstalled } = require("../lib/installer.js");

function writeExecutable(file, contents = "#!/bin/sh\nexit 0\n") {
  fs.writeFileSync(file, contents, { mode: 0o755 });
}

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
  assert.equal(tarballName("linux-x64", "0.3.0"), "tinycloud-linux-x64-v0.3.0.tar.gz");
});

test("normalizeVersion strips a leading v", () => {
  assert.equal(normalizeVersion("v0.3.0"), "0.3.0");
  assert.equal(normalizeVersion("0.3.0"), "0.3.0");
  assert.equal(normalizeVersion("latest"), "latest");
  assert.equal(normalizeVersion("0.3.1-beta.1"), "0.3.1-beta.1");
});

test("normalizeVersion rejects path-traversal and separator inputs", () => {
  for (const bad of ["../../evil", "0.3.0/../../x", "a/b", "..", ".hidden", "-flag"]) {
    assert.throws(() => normalizeVersion(bad), /Invalid version/, bad);
  }
});

function fakeInstall(root, v, { binary = true } = {}) {
  const dir = path.join(root, "versions", v);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".ok"), "{}");
  if (binary) fs.writeFileSync(path.join(dir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

test("pruneVersions never removes protected versions", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tc-prune-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.TINYCLOUD_INSTALL_DIR;
  });
  process.env.TINYCLOUD_INSTALL_DIR = root;
  for (const v of ["0.1.0", "0.2.0", "0.3.0", "0.4.0"]) fakeInstall(root, v);
  // keep 2, but protect the oldest (e.g. pinned via TINYCLOUD_VERSION)
  const removed = pruneVersions(2, ["v0.1.0"]);
  assert.deepEqual(removed, ["0.2.0"]);
  assert.ok(fs.existsSync(path.join(root, "versions", "0.1.0", ".ok")), "protected version kept");
});

test("pruneVersions removes broken entries without spending retention slots", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tc-prune-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.TINYCLOUD_INSTALL_DIR;
  });
  process.env.TINYCLOUD_INSTALL_DIR = root;
  fakeInstall(root, "0.1.0"); // healthy, oldest
  fakeInstall(root, "0.2.0"); // healthy
  fakeInstall(root, "0.3.0", { binary: false }); // broken: .ok but no binary
  fakeInstall(root, "0.4.0", { binary: false }); // broken

  const removed = pruneVersions(2, []);
  assert.deepEqual(removed.sort(), ["0.3.0", "0.4.0"], "broken entries removed, healthy kept");
  assert.ok(fs.existsSync(path.join(root, "versions", "0.1.0", ".ok")), "working old version not crowded out");
  assert.ok(fs.existsSync(path.join(root, "versions", "0.2.0", ".ok")));
});

test("isInstalled is platform-aware (synced cache roots)", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tc-plat-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.TINYCLOUD_INSTALL_DIR;
  });
  process.env.TINYCLOUD_INSTALL_DIR = root;
  const dir = path.join(root, "versions", "0.3.0");
  fs.mkdirSync(dir, { recursive: true });
  writeExecutable(path.join(dir, "tinycloud"));

  fs.writeFileSync(path.join(dir, ".ok"), JSON.stringify({ version: "0.3.0", target: "linux-x64" }));
  assert.equal(isInstalled("0.3.0"), true, "no target → presence check");
  assert.equal(isInstalled("0.3.0", "linux-x64"), true);
  assert.equal(isInstalled("0.3.0", "darwin-arm64"), false, "other platform's extract is not a hit");

  // legacy .ok without platform: infer from recorded URL
  fs.writeFileSync(
    path.join(dir, ".ok"),
    JSON.stringify({ version: "0.3.0", url: "https://x/tinycloud-darwin-arm64-v0.3.0.tar.gz" })
  );
  assert.equal(isInstalled("0.3.0", "darwin-arm64"), true);
  assert.equal(isInstalled("0.3.0", "linux-x64"), false);
});

test("isInstalled requires an executable tinycloud binary", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tc-complete-"));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.TINYCLOUD_INSTALL_DIR;
  });
  process.env.TINYCLOUD_INSTALL_DIR = root;
  const dir = path.join(root, "versions", "0.3.0");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, ".ok"), JSON.stringify({ version: "0.3.0", target: "linux-x64" }));

  assert.equal(isInstalled("0.3.0", "linux-x64"), false, ".ok without binary is incomplete");
  fs.writeFileSync(path.join(dir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o644 });
  assert.equal(isInstalled("0.3.0", "linux-x64"), false, "non-executable binary is incomplete");
  fs.chmodSync(path.join(dir, "tinycloud"), 0o755);
  assert.equal(isInstalled("0.3.0", "linux-x64"), true);
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
