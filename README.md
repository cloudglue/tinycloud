# Tinycloud

Agent CLI for deep video work. Point it at videos and ask for analysis,
dashboards, subtitles, clips, search, or repurposed content — or drive its
verbs directly from your own agent. Powered by [Cloudglue](https://cloudglue.dev).
Learn more at [tinycloud.sh](https://tinycloud.sh).

## Install

```bash
npm install -g @cloudglue/tinycloud     # then: tinycloud
npx @cloudglue/tinycloud                # or run directly
```

The npm package is a small launcher: on first run it downloads the matching
platform distribution from Cloudglue's CDN (cached under
`~/.tinycloud/versions/<version>/`), verifies its checksum, and execs the real
binary. The package version pins the binary version, so
`npx @cloudglue/tinycloud@0.3.0` always runs tinycloud 0.3.0. It also adds two
wrapper commands:

```bash
tinycloud install --version 0.3.0   # pre-download a version
tinycloud install --latest          # install latest stable and pin to it
tinycloud update                    # move to latest stable, prune old versions
```

Alternatively, the shell installer (installs to `~/.tinycloud/bin` and adds
it to your PATH):

```bash
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
```

Platforms: macOS (arm64, x64) and Linux (x64, arm64). Windows is not
supported — use WSL2.

### Setup

Cloud features need a Cloudglue API key:

```bash
tinycloud setup cloudglue --api-key <key>   # or: export CLOUDGLUE_API_KEY=...
tinycloud setup --check --json              # verify
```

## Use tinycloud from your agent

This repo also distributes agent skills that teach coding agents (Claude
Code, Codex, and anything else following the
[Agent Skills](https://agentskills.io) standard) to drive the tinycloud CLI.

**One command** (in a terminal it prompts you to pick the target agents):

```bash
npx @cloudglue/tinycloud skills install                       # menu: claude-code, agents, codex, cursor
npx @cloudglue/tinycloud skills install --harness cursor,codex  # pick targets non-interactively
npx @cloudglue/tinycloud skills install --global              # ~/.claude/skills (Claude Code only)
npx @cloudglue/tinycloud skills install --skill tinycloud,blog-post   # just some
```

Each agent reads skills from its own `<dir>/skills`: `claude-code` → `.claude`,
`agents` → `.agents` (the universal [Agent Skills](https://agentskills.io)
layout), `codex` → `.codex`, `cursor` → `.cursor`. The menu preselects dirs
that already exist; piped/CI runs (or `--yes`) skip it and install into
whichever dirs exist, defaulting to `.claude/skills` when none do.

**Claude Code** (as a plugin):

```text
/plugin marketplace add cloudglue/tinycloud
/plugin install tinycloud@cloudglue
```

Also works with the generic installer (`npx skills add cloudglue/tinycloud`)
or a plain copy (`cp -r skills/* ~/.claude/skills/`).

| Skill | What it does |
|---|---|
| `tinycloud-init` | First-time setup: install the CLI, configure the API key, verify with a free command |
| `tinycloud` | The general skill: full CLI usage, JSON envelope contract, verbs, workflows, glossary, troubleshooting |
| `sales-coaching` | Sales call → coaching dashboard (scores, speech metrics, objections) |
| `blog-post` | Video → rich blog post with sections, thumbnails, takeaways |
| `ad-analysis` | Video ad → shot timeline, hook, pacing, CTA breakdown |
| `meeting-breakdown` | Meeting recording → speaker timeline, summaries, action items |
| `youtube-publish` | Video → YouTube title, description, chapters, tags, subtitles |
| `tinycloud-skill-creator` | Author your own tinycloud-powered skills (recipe + render script) |

New to tinycloud? Invoke `tinycloud-init` in your agent for guided setup.
Each skill checks compatibility via the general skill's
`scripts/preflight.sh`, which gates on the installed binary's version and
feature ids (`skills/tinycloud/tinycloud-skill.json` declares the
requirements).

### Team setup

To give every agent session in a repo the same skills, commit them:

```bash
cd your-project
npx @cloudglue/tinycloud skills install --harness claude-code,agents   # or pick from the menu
git add .claude .agents .codex .cursor 2>/dev/null; git commit -m "Add tinycloud agent skills"
```

Optionally add a line to your project's `CLAUDE.md` so agents reach for them:
`Video work (analysis, captions, clips, workflows) goes through the tinycloud
CLI — see the tinycloud skill; run tinycloud-init if the CLI isn't set up.`

## License

© Aviary Inc. (d/b/a Cloudglue). All rights reserved. Use is subject to [Aviary Inc. Terms of Service](https://cloudglue.dev/terms).
