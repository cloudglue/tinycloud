"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Agent skills bundled with this package (the npm tarball includes skills/).
function bundledSkillsDir() {
  return path.join(__dirname, "..", "skills");
}

function listBundledSkills() {
  const dir = bundledSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((e) => fs.existsSync(path.join(dir, e, "SKILL.md")))
    .sort();
}

/**
 * Pick install targets. Each harness keeps skills in its own directory; we
 * detect harnesses by their config dir to avoid littering projects that
 * don't use them.
 *   claude-code: <project>/.claude/skills  (global: ~/.claude/skills)
 *   codex:       <project>/.agents/skills  (agentskills.io layout)
 */
function resolveTargets({ global: isGlobal, dir, cwd = process.cwd() }) {
  if (dir) return [{ name: "custom", dir: path.resolve(dir) }];
  if (isGlobal) return [{ name: "claude-code (global)", dir: path.join(os.homedir(), ".claude", "skills") }];

  const targets = [];
  if (fs.existsSync(path.join(cwd, ".claude"))) {
    targets.push({ name: "claude-code", dir: path.join(cwd, ".claude", "skills") });
  }
  if (fs.existsSync(path.join(cwd, ".agents"))) {
    targets.push({ name: "codex", dir: path.join(cwd, ".agents", "skills") });
  }
  if (targets.length === 0) {
    // No harness detected: default to claude-code project layout.
    targets.push({ name: "claude-code", dir: path.join(cwd, ".claude", "skills") });
  }
  return targets;
}

function installSkills({ skills, targets, force }) {
  const src = bundledSkillsDir();
  const results = [];
  for (const target of targets) {
    fs.mkdirSync(target.dir, { recursive: true });
    for (const skill of skills) {
      const from = path.join(src, skill);
      const to = path.join(target.dir, skill);
      if (fs.existsSync(to) && !force) {
        results.push({ target: target.name, skill, dir: to, status: "skipped (exists; use --force)" });
        continue;
      }
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      results.push({ target: target.name, skill, dir: to, status: "installed" });
    }
  }
  return results;
}

const USAGE = `Usage: tinycloud skills <list|install> [options]

  list                     List the agent skills bundled with this package
  install                  Copy skills into your agent's skills directory

Install options:
  --skill <a,b,...>        Only these skills (default: all)
  --global                 Install to ~/.claude/skills instead of the project
  --dir <path>             Install to an explicit directory
  --force                  Overwrite skills that are already installed

Detection: a project .claude/ dir targets Claude Code (.claude/skills),
a .agents/ dir targets Codex (.agents/skills); both when both exist.
`;

async function cmdSkills(args) {
  const action = args[0];
  const available = listBundledSkills();

  if (!action || action === "--help" || action === "-h") {
    process.stdout.write(USAGE);
    return;
  }
  if (action === "list") {
    for (const s of available) console.log(s);
    return;
  }
  if (action !== "install") {
    throw new Error(`Unknown skills action: ${action}\n${USAGE}`);
  }

  let wanted = available;
  let isGlobal = false;
  let force = false;
  let dir;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--skill" && args[i + 1]) {
      const names = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = names.filter((n) => !available.includes(n));
      if (unknown.length) {
        throw new Error(`Unknown skill(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
      }
      wanted = names;
    } else if (args[i] === "--global") isGlobal = true;
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--dir" && args[i + 1]) dir = args[++i];
    else throw new Error(`Unknown install option: ${args[i]}\n${USAGE}`);
  }

  if (available.length === 0) {
    throw new Error("No bundled skills found in this package installation");
  }

  const targets = resolveTargets({ global: isGlobal, dir });
  const results = installSkills({ skills: wanted, targets, force });
  for (const r of results) console.log(`${r.status === "installed" ? "✓" : "-"} ${r.skill} → ${r.dir} [${r.status}]`);
  const installed = results.filter((r) => r.status === "installed").length;
  console.log(`\n${installed} skill(s) installed${installed ? ". Restart your agent session to pick them up." : "."}`);
}

module.exports = { cmdSkills, resolveTargets, installSkills, listBundledSkills, bundledSkillsDir };
