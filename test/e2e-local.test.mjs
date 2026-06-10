// End-to-end tests for the npm launcher wrapper against a local fixture CDN.
//
// By default these build a tiny stub tarball (a shell script standing in for
// the real binary) so they run anywhere without the ~90MB distribution.
// Set TINYCLOUD_TEST_TARBALL=/path/to/tinycloud-<platform>.tar.gz to exercise
// the real artifact instead.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { resolveTarget } = require("../lib/platform.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const launcher = path.join(here, "..", "bin", "tinycloud.js");
const installScript = path.join(here, "..", "install.sh");
const fixtureCdn = path.join(here, "fixtures", "make-fixture-cdn.mjs");
const VERSION = "0.3.0";
const TARGET = resolveTarget();

function makeStubTarball(dir) {
  const stage = path.join(dir, "stage");
  fs.mkdirSync(path.join(stage, "bin"), { recursive: true });
  const stub = [
    "#!/bin/sh",
    `if [ "$1" = "--version" ]; then`,
    `  echo '{"name":"tinycloud","version":"${VERSION}","protocol_version":"1","features":["envelope.v1","workflow.v1"]}'`,
    "  exit 0",
    "fi",
    'echo "stub-ran $@"',
  ].join("\n");
  fs.writeFileSync(path.join(stage, "tinycloud"), stub + "\n", { mode: 0o755 });
  const tarball = path.join(dir, `tinycloud-stub.tar.gz`);
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."]);
  return tarball;
}

function startFixture(tarball, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [fixtureCdn, "--tarball", tarball, "--version", VERSION, ...extraArgs],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    let buf = "";
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/LISTENING (\d+)/);
      if (m) resolve({ child, url: `http://127.0.0.1:${m[1]}` });
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`fixture exited early (${code})`)));
  });
}

function runLauncher(args, env, opts = {}) {
  try {
    const stdout = execFileSync(process.execPath, [launcher, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      ...opts,
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

test("launcher downloads, verifies, caches, and execs", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const env = {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: installRoot,
    TINYCLOUD_VERSION: VERSION,
  };

  // First run: downloads via manifest (checksummed) and execs the binary.
  const first = runLauncher(["--version", "--json"], env);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /"version":\s*"0\.3\.0"/);
  const okMarker = path.join(installRoot, "versions", VERSION, ".ok");
  assert.ok(fs.existsSync(okMarker), ".ok marker written");
  assert.match(fs.readFileSync(okMarker, "utf8"), /"verified":true/);

  // Second run: cache fast path — works even with the CDN gone.
  child.kill();
  const second = runLauncher(["--version", "--json"], env);
  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /"version":\s*"0\.3\.0"/);
});

test("launcher rejects a cached version installed for another platform", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const cached = path.join(installRoot, "versions", VERSION);
  const wrongTarget = TARGET === "linux-x64" ? "darwin-arm64" : "linux-x64";
  fs.mkdirSync(cached, { recursive: true });
  fs.writeFileSync(path.join(cached, "tinycloud"), "#!/bin/sh\necho '{\"version\":\"wrong-platform\"}'\n", {
    mode: 0o755,
  });
  fs.writeFileSync(
    path.join(cached, ".ok"),
    JSON.stringify({
      version: VERSION,
      target: wrongTarget,
      url: `https://example.test/tinycloud-${wrongTarget}-v${VERSION}.tar.gz`,
    }) +
      "\n"
  );

  const res = runLauncher(["--version", "--json"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: installRoot,
    TINYCLOUD_VERSION: VERSION,
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /"version":\s*"0\.3\.0"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cached, ".ok"), "utf8")).target, TARGET);
});

test("checksum mismatch fails closed", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--corrupt"]);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const res = runLauncher(["--version"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: installRoot,
    TINYCLOUD_VERSION: VERSION,
  });
  assert.notEqual(res.code, 0);
  assert.match(String(res.stderr), /Checksum mismatch/);
  assert.ok(!fs.existsSync(path.join(installRoot, "versions", VERSION, ".ok")), "no .ok after mismatch");
});

test("install --prune protects the requested --version", { timeout: 30_000 }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-prune-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));

  for (const v of ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0"]) {
    fs.mkdirSync(path.join(work, "versions", v), { recursive: true });
    fs.writeFileSync(path.join(work, "versions", v, ".ok"), "{}");
  }

  const res = runLauncher(["install", "--version", "0.2.0", "--prune"], {
    TINYCLOUD_INSTALL_DIR: work,
    TINYCLOUD_VERSION: "0.3.0",
  });
  assert.equal(res.code, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(work, "versions", "0.2.0", ".ok")), "requested version kept");
  assert.ok(fs.existsSync(path.join(work, "versions", "0.3.0", ".ok")), "active version kept");
  assert.ok(!fs.existsSync(path.join(work, "versions", "0.1.0", ".ok")), "old unprotected version pruned");
});

test("install rejects --version with --latest", { timeout: 30_000 }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-install-conflict-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));

  const res = runLauncher(["install", "--version", "0.2.0", "--latest"], {
    TINYCLOUD_DIST_URL: "http://127.0.0.1:1",
    TINYCLOUD_INSTALL_DIR: work,
  });
  assert.notEqual(res.code, 0);
  assert.match(String(res.stderr), /--version and --latest cannot be used together/);
});

test("missing manifest degrades to sidecar verification", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--no-manifest"]);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const env = { TINYCLOUD_DIST_URL: url, TINYCLOUD_INSTALL_DIR: installRoot, TINYCLOUD_VERSION: VERSION };

  const res = runLauncher(["--version", "--json"], env);
  assert.equal(res.code, 0, res.stderr);
  assert.match(
    fs.readFileSync(path.join(installRoot, "versions", VERSION, ".ok"), "utf8"),
    /"verified":true/,
    "sidecar sha256 still verifies"
  );

  // Strict mode: missing manifest is a hard error.
  const strict = runLauncher(["--version"], {
    ...env,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root-strict"),
    TINYCLOUD_REQUIRE_MANIFEST: "1",
  });
  assert.notEqual(strict.code, 0);
  assert.match(String(strict.stderr), /TINYCLOUD_REQUIRE_MANIFEST/);
});

test("install.sh preserves user-owned common directories", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-install-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installDir = path.join(work, "bin");
  const userBin = path.join(installDir, "bin");
  fs.mkdirSync(userBin, { recursive: true });
  fs.writeFileSync(path.join(installDir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.writeFileSync(path.join(userBin, "user-tool"), "keep\n");

  execFileSync("bash", [installScript, "--install-dir", installDir, "--version", VERSION], {
    encoding: "utf8",
    env: { ...process.env, HOME: path.join(work, "home"), SHELL: "/bin/sh", TINYCLOUD_DIST_URL: url },
  });

  assert.equal(fs.readFileSync(path.join(userBin, "user-tool"), "utf8"), "keep\n");
});

test("v-prefixed version and broken cache dir both recover", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  // simulate a broken completed install: .ok exists but the binary is gone
  const cached = path.join(installRoot, "versions", VERSION);
  fs.mkdirSync(cached, { recursive: true });
  fs.writeFileSync(path.join(cached, ".ok"), JSON.stringify({ version: VERSION, target: TARGET }) + "\n");

  const res = runLauncher(["--version", "--json"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: installRoot,
    TINYCLOUD_VERSION: `v${VERSION}`, // v-prefix must normalize
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /"version":\s*"0\.3\.0"/);
  assert.ok(fs.existsSync(path.join(installRoot, "versions", VERSION, "tinycloud")), "binary restored");
  assert.ok(fs.existsSync(path.join(installRoot, "versions", VERSION, ".ok")), "broken dir reclaimed");
});

test("TINYCLOUD_VERSION traversal input fails closed", { timeout: 30_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const res = runLauncher(["--version"], {
    TINYCLOUD_DIST_URL: "http://127.0.0.1:1",
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
    TINYCLOUD_VERSION: "../../escape",
  });
  assert.notEqual(res.code, 0);
  assert.match(String(res.stderr), /Invalid version/);
});

test("latest without manifest reuses warm cache via ETag", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--no-manifest"]);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const env = { TINYCLOUD_DIST_URL: url, TINYCLOUD_INSTALL_DIR: installRoot, TINYCLOUD_VERSION: "latest" };

  const first = runLauncher(["--version", "--json"], env);
  assert.equal(first.code, 0, first.stderr);
  const okPath = path.join(installRoot, "versions", VERSION, ".ok");
  const before = fs.statSync(okPath).mtimeMs;

  const second = runLauncher(["--version", "--json"], env);
  assert.equal(second.code, 0, second.stderr);
  assert.equal(fs.statSync(okPath).mtimeMs, before, "no re-download/re-extract on warm cache");
});

test("update requires the manifest", { timeout: 60_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--no-manifest"]);
  t.after(() => child.kill());

  const res = runLauncher(["update"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
  });
  assert.notEqual(res.code, 0);
  assert.match(String(res.stderr), /requires the release manifest/);
});
