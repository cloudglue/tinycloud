---
name: tinycloud-skill-creator
description: >-
  Create a new tinycloud-powered skill: a SKILL.md plus optional workflow
  recipe and render script that run tinycloud CLI commands and produce
  deliverables (HTML reports, markdown, JSON, clips, published sites). Use
  when the user wants to build, scaffold, or package a custom repeatable
  video workflow as a skill — for this agent, for another agent, or for the
  tinycloud agent itself. Requires the tinycloud CLI.
argument-hint: "[skill goal or name]"
arguments: goal
---

# Create a tinycloud-powered skill

Walk the user from an idea ("turn a sales call into a follow-up email page")
to an installed, validated skill. The skills you create run tinycloud verbs
and workflows, but their OUTPUT is a deliverable consumed outside the
conversation: an HTML page, a markdown doc, a JSON payload, clip files,
captions, a published site URL. Author for that external consumer.

Prerequisite: the tinycloud CLI configured with a Cloudglue API key. If the
general `tinycloud` skill is installed alongside this one, run its
`scripts/preflight.sh` first; otherwise check
`tinycloud setup --check --json` → `data.ok` (install:
`npm install -g @cloudglue/tinycloud`, see https://tinycloud.sh). For the
recipe YAML schema, use the `tinycloud` skill's reference/workflow-authoring.md
if installed, or the schema reference bundled with the binary at
`<install>/skills/skill-creator/references/workflow-schema.md`.

## 1. Interview

Before writing anything, establish:

- **Deliverable**: what file(s) does the skill produce, and who consumes
  them? (HTML report, markdown summary, JSON for an API, clips, captions, a
  published site URL.)
- **Inputs**: one video? a URL? a collection? several sources?
- **Shape**: a repeatable recipe with known steps → workflow-backed; or
  exploratory work where the agent picks each next command → direct-verb.
- **Where it lives** (pick the target before scaffolding):
  - *This host agent* (Claude Code, etc.): a skill directory in the agent's
    skills location (e.g. `~/.claude/skills/<name>/` or the project's
    `.claude/skills/<name>/`) whose SKILL.md runs the recipe **by path**.
  - *The tinycloud agent*: `~/.tinycloud/skills/<name>/` (global) or
    `.tinycloud/skills/<name>/` (project), picked up as `/skills:<name>`.
    (With `--home`/`--profile`, 0.3.3+, the global dir is the active home's
    `skills/`; a project's `.tinycloud/config.json` can allowlist skills.)

## 2. Scaffold

The tinycloud distribution bundles a scaffolder next to the binary. Locate
it (try in order; fall back to hand-authoring from the workflow-authoring
reference if absent):

```bash
TC_DIR="$(dirname "$(command -v tinycloud)")"                      # curl install
SCAFFOLDER="$TC_DIR/skills/skill-creator/scripts/init-skill.js"
# npm-wrapper installs keep versions under ~/.tinycloud/versions/<v>/
[ -f "$SCAFFOLDER" ] || SCAFFOLDER="$(ls -d ~/.tinycloud/versions/*/skills/skill-creator/scripts/init-skill.js 2>/dev/null | tail -1)"

node "$SCAFFOLDER" <skill-name> --description "<one-line description>" \
  --dir <target-dir> --pattern workflow|direct
```

It creates `<target-dir>/<skill-name>/`: a SKILL.md skeleton, and for the
workflow pattern a `<skill-name>.yaml` recipe plus `scripts/render.js` and
`package.json`. It never overwrites an existing directory.

## 3. Author

Edit the scaffolded files with the user's specifics.

- **Description is the trigger.** Name the deliverable and the input ("Turn
  a sales call into a follow-up email HTML page"), not the mechanism ("uses
  watch and extract").
- **Body**: imperative instructions — the exact commands to run, how to
  branch on envelope `status`, what to report back. Keep SKILL.md short;
  push schemas, examples, and template detail into files next to it.
  Relative paths in workflow YAML resolve against the recipe directory.
- **Generalize**: the skill will run on videos you have not seen — never
  hard-code anything from the example video used while authoring.
- For a host-agent skill, the SKILL.md body invokes the recipe by path:

  ```bash
  tinycloud workflow run ${CLAUDE_SKILL_DIR}/<skill-name>.yaml $source --allow-command --json
  ```

**Output contract** (the "outside the agent" rules):

- Write deliverables under `./tinycloud-output/` or `${{ run.dir }}` and
  report the absolute path; never leave outputs only in conversation text.
- stdout is machine output (envelopes/paths); logs and progress go to stderr.
- In render scripts, inject data into HTML templates via one single-token
  placeholder (replace `DATA_JSON_HERE` with `JSON.stringify(data)`), not
  interpolated JS object literals.
- If the deliverable should be a URL, finish with
  `tinycloud publish <html-or-dir> --visibility public|private --json` and
  ask the user public-or-private before the first publish. Report `data.url`
  (the stable site link) as the deliverable; fresh content can take ~1 min to
  appear there — `data.version_url` serves that exact version immediately.

## 4. Validate and dry-run

```bash
tinycloud workflow validate <dir>/<skill-name>/<skill-name>.yaml --json
tinycloud workflow plan <dir>/<skill-name>/<skill-name>.yaml <test-source> --json
tinycloud workflow run <dir>/<skill-name>/<skill-name>.yaml <test-source> --allow-command --json
```

`validate` checks the recipe (free), `plan` resolves the graph with no side
effects (free), `run` executes — cloud steps run through the configured
Cloudglue API key. Branch on the envelope `status` — `ready` means consume
`data.outputs`; anything else means stop and surface the next action. Open
the produced deliverable and check it against the user's intent before
declaring success.

## 5. Gate and distribute

- Command steps are gated: keep `permissions: [command]` in the recipe for
  trusted skills, or require `--allow-command` per run. `--no-command`
  always wins.
- For skills distributed to other machines, gate on the installed binary:
  `tinycloud --version --json` reports `version` and `features` — document a
  `min_version` in the skill (the general `tinycloud` skill's
  `tinycloud-skill.json` shows the manifest pattern, when installed).

## Iterating on an existing skill

Read its SKILL.md and recipe, re-run `workflow validate`/`plan` after edits,
and re-test with the same source the user reported the problem on. Tighten
the description if the skill failed to trigger; move detail out of SKILL.md
if it grew past ~150 lines.
