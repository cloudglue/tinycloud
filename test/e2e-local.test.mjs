// End-to-end tests for the npm launcher wrapper against a local fixture CDN.
//
// By default these build a tiny stub tarball (a shell script standing in for
// the real binary) so they run anywhere without the ~90MB distribution.
// Set TINYCLOUD_TEST_TARBALL=/path/to/tinycloud-<platform>.tar.gz to exercise
// the real artifact instead.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
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
  const r = spawnSync(process.execPath, [launcher, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    ...opts,
  });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
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

test("install --prune is standalone: protects the env pin, rejects install specs", { timeout: 30_000 }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-prune-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));

  for (const v of ["0.1.0", "0.2.0", "0.3.0", "0.4.0", "0.5.0"]) {
    const dir = path.join(work, "versions", v);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".ok"), "{}");
    fs.writeFileSync(path.join(dir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }

  // combining an install spec with --prune is ambiguous → error
  for (const args of [["install", "--version", "0.2.0", "--prune"], ["install", "--latest", "--prune"]]) {
    const rejected = runLauncher(args, { TINYCLOUD_INSTALL_DIR: work });
    assert.notEqual(rejected.code, 0, args.join(" "));
    assert.match(String(rejected.stderr), /--prune is a standalone action/);
  }

  // standalone prune protects the active pin and trims the rest
  const res = runLauncher(["install", "--prune"], {
    TINYCLOUD_INSTALL_DIR: work,
    TINYCLOUD_VERSION: "0.3.0",
  });
  assert.equal(res.code, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(work, "versions", "0.3.0", ".ok")), "active version kept");
  assert.ok(fs.existsSync(path.join(work, "versions", "0.5.0", ".ok")), "newest kept");
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

test("manifest 5xx and garbage-200 degrade instead of failing the install", { timeout: 120_000 }, async (t) => {
  for (const mode of [["--manifest-status", "500"], ["--manifest-garbage"]]) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
    t.after(() => fs.rmSync(work, { recursive: true, force: true }));
    const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
    const { child, url } = await startFixture(tarball, mode);
    t.after(() => child.kill());

    const res = runLauncher(["--version", "--json"], {
      TINYCLOUD_DIST_URL: url,
      TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
      TINYCLOUD_VERSION: VERSION,
    });
    assert.equal(res.code, 0, `${mode.join(" ")}: ${res.stderr}`);
    assert.match(res.stdout, /"version":\s*"0\.3\.0"/, mode.join(" "));
    child.kill();
  }
});

test("strict mode hard-fails on an unusable manifest", { timeout: 60_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--manifest-garbage"]);
  t.after(() => child.kill());

  const res = runLauncher(["--version"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
    TINYCLOUD_VERSION: VERSION,
    TINYCLOUD_REQUIRE_MANIFEST: "1",
  });
  assert.notEqual(res.code, 0);
  assert.match(String(res.stderr), /TINYCLOUD_REQUIRE_MANIFEST/);
});

test("strict mode requires a checksum, not just a manifest", { timeout: 60_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-nosha-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--manifest-no-sha", "--no-sidecar"]);
  t.after(() => child.kill());

  const env = {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
    TINYCLOUD_VERSION: VERSION,
  };
  const strict = runLauncher(["--version"], { ...env, TINYCLOUD_REQUIRE_MANIFEST: "1" });
  assert.notEqual(strict.code, 0);
  assert.match(String(strict.stderr), /no checksum is available/);

  // non-strict still installs (warn-and-proceed semantics)
  const lax = runLauncher(["--version", "--json"], env);
  assert.equal(lax.code, 0, lax.stderr);
});

test("TINYCLOUD_DIST_URL override rebases the manifest's canonical URLs", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  // manifest URLs point at media.cloudglue.dev; the download must still come
  // from the fixture because TINYCLOUD_DIST_URL overrides the base
  const { child, url } = await startFixture(tarball, ["--canonical-urls"]);
  t.after(() => child.kill());

  const res = runLauncher(["--version", "--json"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
    TINYCLOUD_VERSION: VERSION,
  });
  assert.equal(res.code, 0, res.stderr);
  const ok = JSON.parse(fs.readFileSync(path.join(work, "root", "versions", VERSION, ".ok"), "utf8"));
  assert.ok(ok.url.startsWith(url), `download came from the override (${ok.url})`);
  assert.equal(ok.verified, true, "manifest checksum still applied");
});

test("pinned version missing from the manifest falls back to the direct URL", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  // manifest only lists 9.9.9; the pinned 0.3.0 tarball + sidecar still exist
  const { child, url } = await startFixture(tarball, ["--manifest-only-version", "9.9.9"]);
  t.after(() => child.kill());

  const res = runLauncher(["--version", "--json"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: path.join(work, "root"),
    TINYCLOUD_VERSION: VERSION,
  });
  assert.equal(res.code, 0, res.stderr);
  assert.match(String(res.stderr), /not in the release manifest; trying the direct URL/);
  assert.match(res.stdout, /"version":\s*"0\.3\.0"/);
});

test("latest pin falls back to the newest cached install when offline", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-e2e-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installRoot = path.join(work, "root");
  const env = { TINYCLOUD_DIST_URL: url, TINYCLOUD_INSTALL_DIR: installRoot, TINYCLOUD_VERSION: "latest" };
  const first = runLauncher(["--version", "--json"], env);
  assert.equal(first.code, 0, first.stderr);

  child.kill(); // CDN goes away
  const offline = runLauncher(["--version", "--json"], { ...env, TINYCLOUD_DIST_URL: "http://127.0.0.1:1" });
  assert.equal(offline.code, 0, offline.stderr);
  assert.match(String(offline.stderr), /using cached/);
  assert.match(offline.stdout, /"version":\s*"0\.3\.0"/);
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

test("install.sh upgrade removes ghost files from prior versions", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-install-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installDir = path.join(work, "bin");
  const env = { ...process.env, HOME: path.join(work, "home"), SHELL: "/bin/sh", TINYCLOUD_DIST_URL: url };

  // first install, then plant a ghost the "old version" shipped — recorded
  // in .tinycloud-files like any real member of the previous tarball
  execFileSync("bash", [installScript, "--install-dir", installDir, "--version", VERSION], { encoding: "utf8", env });
  const ghost = path.join(installDir, "skills", "removed-in-new-version");
  fs.mkdirSync(ghost, { recursive: true });
  fs.writeFileSync(path.join(ghost, "SKILL.md"), "ghost\n");
  fs.appendFileSync(
    path.join(installDir, ".tinycloud-files"),
    "./skills/removed-in-new-version/\n./skills/removed-in-new-version/SKILL.md\n"
  );
  // a user's own file in skills/ is NOT recorded and must survive
  const userSkill = path.join(installDir, "skills", "my-custom", "SKILL.md");
  fs.mkdirSync(path.dirname(userSkill), { recursive: true });
  fs.writeFileSync(userSkill, "mine\n");

  const out = execFileSync("bash", [installScript, "--install-dir", installDir, "--version", VERSION], {
    encoding: "utf8",
    env,
  });
  assert.ok(!fs.existsSync(ghost), "stale recorded skill dir removed on upgrade");
  assert.equal(fs.readFileSync(userSkill, "utf8"), "mine\n", "unrecorded user skill survives");
  assert.ok(!out.includes("not part of a tinycloud"), "no mixed-dir warning on a normal upgrade");
});

test("install.sh degrades on a truncated manifest instead of failing the install", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-trunc-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball, ["--manifest-truncated"]);
  t.after(() => child.kill());

  const installDir = path.join(work, "bin");
  const out = execFileSync("bash", [installScript, "--install-dir", installDir], {
    encoding: "utf8",
    env: { ...process.env, HOME: path.join(work, "home"), SHELL: "/bin/sh", TINYCLOUD_DIST_URL: url },
  });
  assert.ok(fs.existsSync(path.join(installDir, "tinycloud")), "unpinned install succeeded via the alias path");
  assert.match(out + "", /installed successfully/);
});

test("legacy (pre-record) upgrade keeps user skills, removes bundled-name ghosts", { timeout: 120_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-legacy-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  const installDir = path.join(work, "bin");
  const env = { ...process.env, HOME: path.join(work, "home"), SHELL: "/bin/sh", TINYCLOUD_DIST_URL: url };

  // simulate a pre-record install: install, then drop the member record
  execFileSync("bash", [installScript, "--install-dir", installDir, "--version", VERSION], { encoding: "utf8", env });
  fs.rmSync(path.join(installDir, ".tinycloud-files"));
  // a bundled-name ghost from the old version, and a user-authored skill
  fs.mkdirSync(path.join(installDir, "skills", "media-artifact"), { recursive: true });
  fs.writeFileSync(path.join(installDir, "skills", "media-artifact", "SKILL.md"), "old bundled\n");
  fs.mkdirSync(path.join(installDir, "skills", "my-own-skill"), { recursive: true });
  fs.writeFileSync(path.join(installDir, "skills", "my-own-skill", "SKILL.md"), "mine\n");

  execFileSync("bash", [installScript, "--install-dir", installDir, "--version", VERSION], { encoding: "utf8", env });
  // the ghost's old content must be gone — either the dir was removed (stub
  // tarball ships no skills) or replaced by the new tarball's real copy
  const ghostFile = path.join(installDir, "skills", "media-artifact", "SKILL.md");
  if (fs.existsSync(ghostFile)) {
    assert.notEqual(fs.readFileSync(ghostFile, "utf8"), "old bundled\n", "bundled-name ghost replaced");
  }
  assert.equal(
    fs.readFileSync(path.join(installDir, "skills", "my-own-skill", "SKILL.md"), "utf8"),
    "mine\n",
    "user-authored skill survives the legacy upgrade"
  );
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

test("malformed TINYCLOUD_VERSION doesn't break standalone prune", { timeout: 30_000 }, (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-badenv-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  for (const v of ["0.1.0", "0.2.0", "0.3.0"]) {
    const dir = path.join(work, "versions", v);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".ok"), "{}");
    fs.writeFileSync(path.join(dir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  // prune with a garbage env pin: must not crash; falls back to age-only
  const res = runLauncher(["install", "--prune"], {
    TINYCLOUD_INSTALL_DIR: work,
    TINYCLOUD_VERSION: "../../bad",
  });
  assert.equal(res.code, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(work, "versions", "0.3.0", ".ok")), "newest versions retained");
});

test("prune protects the tree a 'latest' pin resolves to", { timeout: 60_000 }, async (t) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "tc-latestpin-"));
  t.after(() => fs.rmSync(work, { recursive: true, force: true }));
  const tarball = process.env.TINYCLOUD_TEST_TARBALL || makeStubTarball(work);
  // fixture manifest: channels.stable = 0.3.0
  const { child, url } = await startFixture(tarball);
  t.after(() => child.kill());

  // 0.3.0 (= stable) is OLDER than other healthy caches: without resolving
  // the pin, keep-2 would delete it.
  for (const v of ["0.3.0", "0.8.0", "0.9.0"]) {
    const dir = path.join(work, "versions", v);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".ok"), "{}");
    fs.writeFileSync(path.join(dir, "tinycloud"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }

  const res = runLauncher(["install", "--prune"], {
    TINYCLOUD_DIST_URL: url,
    TINYCLOUD_INSTALL_DIR: work,
    TINYCLOUD_VERSION: "latest",
  });
  assert.equal(res.code, 0, res.stderr);
  assert.ok(fs.existsSync(path.join(work, "versions", "0.3.0", ".ok")), "latest-resolved stable kept");
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
