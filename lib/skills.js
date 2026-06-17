"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

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
 * Known agent harnesses. Each keeps skills in its own <configDir>/skills dir,
 * all using the SKILL.md layout. `id` is both the menu label and the
 * --harness token; `aliases` are extra accepted tokens.
 *   claude-code: <project>/.claude/skills  (global: ~/.claude/skills)
 *   agents:      <project>/.agents/skills  (universal agentskills.io layout)
 *   codex:       <project>/.codex/skills
 *   cursor:      <project>/.cursor/skills
 */
const HARNESSES = [
  { id: "claude-code", aliases: ["claude"], configDir: ".claude" },
  { id: "agents", aliases: [], configDir: ".agents" },
  { id: "codex", aliases: [], configDir: ".codex" },
  { id: "cursor", aliases: [], configDir: ".cursor" },
];

function harnessIds() {
  return HARNESSES.map((h) => h.id);
}

// Resolve a --harness token (id or alias, case-insensitive) to its entry.
function findHarness(token) {
  const t = String(token).trim().toLowerCase();
  return HARNESSES.find((h) => h.id === t || h.aliases.includes(t));
}

function harnessTarget(h, cwd) {
  return { name: h.id, dir: path.join(cwd, h.configDir, "skills") };
}

function detectHarnesses(cwd) {
  return HARNESSES.filter((h) => fs.existsSync(path.join(cwd, h.configDir)));
}

/**
 * Pick install targets from flags/detection only — no prompting or I/O beyond
 * existence checks, so it stays deterministic for tests. The interactive menu
 * lives in promptForTargets(). Precedence: --dir > --global > --harness >
 * detection (and .claude when nothing is detected).
 */
function resolveTargets({ global: isGlobal, dir, harness, cwd = process.cwd() }) {
  if (dir) return [{ name: "custom", dir: path.resolve(dir) }];
  if (isGlobal) return [{ name: "claude-code (global)", dir: path.join(os.homedir(), ".claude", "skills") }];

  if (harness && harness.length) {
    return harness.map((token) => {
      const h = findHarness(token);
      if (!h) throw new Error(`Unknown harness: ${token}. Valid: ${harnessIds().join(", ")}`);
      return harnessTarget(h, cwd);
    });
  }

  const detected = detectHarnesses(cwd);
  if (detected.length) return detected.map((h) => harnessTarget(h, cwd));
  // No harness detected: default to claude-code project layout.
  return [harnessTarget(HARNESSES[0], cwd)];
}

/**
 * Interactive picker: list the four harnesses (detected ones preselected) and
 * read a comma-separated choice. Streams are injectable for testing; empty or
 * unparseable input falls back to the preselection.
 */
async function promptForTargets({ cwd = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const detected = new Set(detectHarnesses(cwd).map((h) => h.id));
  const rows = HARNESSES.map((h, i) => ({ n: i + 1, h, detected: detected.has(h.id) }));
  const preselected = rows.some((r) => r.detected)
    ? rows.filter((r) => r.detected).map((r) => r.n)
    : [1];

  output.write("Which agents should get the skills?\n");
  for (const r of rows) {
    const mark = preselected.includes(r.n) ? "x" : " ";
    const tag = r.detected ? "   (detected)" : "";
    output.write(`  ${r.n}) [${mark}] ${r.h.id.padEnd(11)} ${path.join(r.h.configDir, "skills")}${tag}\n`);
  }

  const rl = readline.createInterface({ input, output });
  const answer = await new Promise((resolve) => {
    rl.question(`Enter numbers (comma-separated) [${preselected.join(",")}]: `, resolve);
  });
  rl.close();

  let nums = answer
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= rows.length);
  if (!nums.length) nums = preselected;

  return rows.filter((r) => nums.includes(r.n)).map((r) => harnessTarget(r.h, cwd));
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
  --harness <a,b,...>      Install into these agents: claude-code, agents, codex, cursor
                           (default: pick from a menu in a terminal; auto-detect otherwise)
  --global                 Install to ~/.claude/skills instead of the project (Claude Code only)
  --dir <path>             Install to an explicit directory
  --yes, -y                Skip the interactive menu; use auto-detection
  --force                  Overwrite skills that are already installed

Each harness holds skills under <dir>/skills: claude-code → .claude, agents → .agents
(universal agentskills.io layout), codex → .codex, cursor → .cursor. Run in a terminal
with no target and you'll be prompted to pick (detected dirs preselected); piped/CI runs
install into whichever dirs exist, or .claude when none do.
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
  let yes = false;
  let dir;
  let harness;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--skill" && args[i + 1]) {
      const names = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = names.filter((n) => !available.includes(n));
      if (unknown.length) {
        throw new Error(`Unknown skill(s): ${unknown.join(", ")}. Available: ${available.join(", ")}`);
      }
      wanted = names;
    } else if (args[i] === "--harness" && args[i + 1]) {
      harness = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
      const unknown = harness.filter((id) => !findHarness(id));
      if (unknown.length) {
        throw new Error(`Unknown harness(es): ${unknown.join(", ")}. Valid: ${harnessIds().join(", ")}`);
      }
    } else if (args[i] === "--global") isGlobal = true;
    else if (args[i] === "--force") force = true;
    else if (args[i] === "--yes" || args[i] === "-y") yes = true;
    else if (args[i] === "--dir" && args[i + 1]) dir = args[++i];
    else throw new Error(`Unknown install option: ${args[i]}\n${USAGE}`);
  }

  if (available.length === 0) {
    throw new Error("No bundled skills found in this package installation");
  }

  const explicit = dir || isGlobal || (harness && harness.length);
  const targets =
    !explicit && !yes && process.stdin.isTTY && process.stdout.isTTY
      ? await promptForTargets({})
      : resolveTargets({ global: isGlobal, dir, harness });

  const results = installSkills({ skills: wanted, targets, force });
  for (const r of results) console.log(`${r.status === "installed" ? "✓" : "-"} ${r.skill} → ${r.dir} [${r.status}]`);
  const installed = results.filter((r) => r.status === "installed").length;
  console.log(`\n${installed} skill(s) installed${installed ? ". Restart your agent session to pick them up." : "."}`);
}

module.exports = {
  cmdSkills,
  resolveTargets,
  promptForTargets,
  installSkills,
  listBundledSkills,
  bundledSkillsDir,
  HARNESSES,
};
