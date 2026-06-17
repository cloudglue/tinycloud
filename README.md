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

**One command** (detects your agent and installs the bundled skills):

```bash
npx @cloudglue/tinycloud skills install          # project-level (.claude/skills, .agents/skills)
npx @cloudglue/tinycloud skills install --global # ~/.claude/skills (all your projects)
npx @cloudglue/tinycloud skills install --skill tinycloud,blog-post   # just some
```

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
npx @cloudglue/tinycloud skills install     # writes .claude/skills/ (and .agents/skills/ if present)
git add .claude .agents 2>/dev/null; git commit -m "Add tinycloud agent skills"
```

Optionally add a line to your project's `CLAUDE.md` so agents reach for them:
`Video work (analysis, captions, clips, workflows) goes through the tinycloud
CLI — see the tinycloud skill; run tinycloud-init if the CLI isn't set up.`

## Commands

Cloud commands run through your configured Cloudglue API key (billed per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card)); local and
network commands are free. Every command prints a JSON envelope on stdout (logs
go to stderr) — pass `--json`.

| Command | What it does |
|---|---|
| `watch` | Analyze a video → reusable cached context + Cloudglue-ready ref |
| `extract` | Pull structured facts, entities, or moments (free-form or JSON-schema) |
| `caption` | Subtitles and transcripts (SRT/VTT/ASS) |
| `search` | Keyword search over cached video context |
| `probe` | Semantic moment/video search over a Cloudglue scope |
| `ask` | Grounded Q&A over one or more videos |
| `clip` | ffmpeg-backed cut, thumbs, stitch, transcode, burn, split, audio, info |
| `grab` | Download a remote video (YouTube, TikTok, Loom, direct) |
| `library` | Browse and sync Cloudglue collections and connectors |
| `jobs` | Poll, wait on, or forget async jobs |
| `workflow` | Run packaged pipeline recipes (see below) |
| `publish` | Publish HTML artifacts as Cloudglue Sites; share videos |
| `setup` | Configure the Cloudglue API key and service connections |

A few common invocations:

```bash
# Analyze a video into reusable, cached context + a Cloudglue-ready ref
tinycloud watch ./demo.mp4 --json
# Pull structured findings (free-form query here; pass --schema for a fixed shape)
tinycloud extract "key moments with timestamps" ./demo.mp4 --json
# Subtitles plus a markdown transcript
tinycloud caption ./demo.mp4 --format srt --transcript --json
# Trim a clip locally — no upload, ffmpeg-backed
tinycloud clip cut ./demo.mp4 --start 12 --end 28 -o clip.mp4 --json
# Grounded Q&A over one or more videos
tinycloud ask "What objections came up?" --in ./demo.mp4 --json
```

`tinycloud commands --json` is the authoritative, machine-readable list of
every command and flag. Full per-verb flags and cost classes:
[skills/tinycloud/reference/verbs.md](skills/tinycloud/reference/verbs.md).
The envelope contract — statuses (`ready`, `pending`, `needs_credentials`, …)
and exit codes:
[skills/tinycloud/reference/envelope.md](skills/tinycloud/reference/envelope.md).

## Workflows

Workflows are packaged, repeatable pipelines that run with a single command
and write their outputs into a run directory under
`./tinycloud-output/runs/<run_id>/`. The five flagship recipes — each with a
matching agent skill — are:

| Workflow | Turns a video into |
|---|---|
| `sales-coaching` | Coaching dashboard — call scores, speech metrics, objections |
| `blog-post` | Rich blog post — sections, thumbnails, takeaways |
| `ad-analysis` | Ad breakdown — shot timeline, hook, pacing, CTA |
| `meeting-breakdown` | Speaker timeline, chapter summaries, action items |
| `youtube-publish` | YouTube title, description, chapters, tags, subtitles |

```bash
tinycloud workflow list --json                       # all available recipes
tinycloud workflow sales-coaching ./call.mp4 --json  # run one
tinycloud workflow plan blog-post ./demo.mp4 --json  # preview steps (free, no side effects)
tinycloud workflow validate ad-analysis --json       # check a recipe (or a path)
```

The final envelope reports `data.status`
(`completed | partial | failed | paused`), `data.outputs` (named outputs such
as `outputs.html`), and `data.artifacts[].path`. The five above each have a
matching agent skill (see the table), so coding agents can run them directly;
`tinycloud workflow list` shows the full set, including building blocks like
`summary` and `clip-highlights`. Author your own recipes:
[skills/tinycloud/reference/workflow-authoring.md](skills/tinycloud/reference/workflow-authoring.md)
(or scaffold one with the `tinycloud-skill-creator` skill).

## License

© Aviary Inc. (d/b/a Cloudglue). All rights reserved. Use is subject to [Aviary Inc. Terms of Service](https://cloudglue.dev/terms).
