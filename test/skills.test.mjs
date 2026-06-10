import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { listBundledSkills, resolveTargets, installSkills } = require("../lib/skills.js");
const launcher = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "tinycloud.js");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tc-skills-"));
}

test("bundled skills are discovered", () => {
  const skills = listBundledSkills();
  assert.ok(skills.includes("tinycloud"), "general skill present");
  assert.ok(skills.includes("tinycloud-init"), "init skill present");
  assert.ok(skills.includes("blog-post"), "workflow skill present");
  assert.ok(skills.length >= 8, `expected >= 8 skills, got ${skills.length}`);
});

test("resolveTargets detects harness dirs", (t) => {
  const cwd = tmpdir();
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

  // no harness dirs → default claude-code project layout
  assert.deepEqual(
    resolveTargets({ cwd }).map((x) => x.dir),
    [path.join(cwd, ".claude", "skills")]
  );

  fs.mkdirSync(path.join(cwd, ".agents"));
  assert.deepEqual(
    resolveTargets({ cwd }).map((x) => x.name),
    ["codex"]
  );

  fs.mkdirSync(path.join(cwd, ".claude"));
  assert.deepEqual(
    resolveTargets({ cwd }).map((x) => x.name).sort(),
    ["claude-code", "codex"]
  );

  // explicit dir wins over detection
  assert.deepEqual(resolveTargets({ cwd, dir: "/tmp/x" }), [{ name: "custom", dir: path.resolve("/tmp/x") }]);
});

test("installSkills copies full skill subtrees and respects --force", (t) => {
  const dest = tmpdir();
  t.after(() => fs.rmSync(dest, { recursive: true, force: true }));
  const targets = [{ name: "custom", dir: dest }];

  const results = installSkills({ skills: ["tinycloud", "blog-post"], targets, force: false });
  assert.ok(results.every((r) => r.status === "installed"));
  // the general skill's subtree must travel
  assert.ok(fs.existsSync(path.join(dest, "tinycloud", "reference", "envelope.md")));
  assert.ok(fs.existsSync(path.join(dest, "tinycloud", "scripts", "preflight.sh")));
  assert.ok(fs.existsSync(path.join(dest, "tinycloud", "tinycloud-skill.json")));
  assert.ok(fs.existsSync(path.join(dest, "blog-post", "SKILL.md")));
  // exec bit preserved
  assert.ok(fs.statSync(path.join(dest, "tinycloud", "scripts", "preflight.sh")).mode & 0o100);

  // second install without force skips
  const again = installSkills({ skills: ["tinycloud"], targets, force: false });
  assert.match(again[0].status, /skipped/);
  const forced = installSkills({ skills: ["tinycloud"], targets, force: true });
  assert.equal(forced[0].status, "installed");
});

test("bin: skills install works offline (no binary download)", (t) => {
  const dest = tmpdir();
  t.after(() => fs.rmSync(dest, { recursive: true, force: true }));
  const out = execFileSync(
    process.execPath,
    [launcher, "skills", "install", "--skill", "tinycloud-init", "--dir", dest],
    {
      encoding: "utf8",
      env: { ...process.env, TINYCLOUD_DIST_URL: "http://127.0.0.1:1" }, // unreachable — must not be touched
    }
  );
  assert.match(out, /1 skill\(s\) installed/);
  assert.ok(fs.existsSync(path.join(dest, "tinycloud-init", "SKILL.md")));
});

test("bin: skills list and unknown-skill error", () => {
  const list = execFileSync(process.execPath, [launcher, "skills", "list"], { encoding: "utf8" });
  assert.match(list, /tinycloud\n/);
  assert.throws(
    () => execFileSync(process.execPath, [launcher, "skills", "install", "--skill", "nope", "--dir", "/tmp/x"], { encoding: "utf8", stdio: "pipe" }),
    /Unknown skill/
  );
});
