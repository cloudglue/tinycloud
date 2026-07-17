# Tinycloud

Agent CLI for deep video and image work. Point it at videos or images and ask
for analysis, dashboards, subtitles, clips, search, or repurposed content — or
drive its verbs directly from your own agent. Powered by
[Cloudglue](https://cloudglue.dev). Learn more at
[tinycloud.sh](https://tinycloud.sh).

## Install

```bash
npm install -g @cloudglue/tinycloud     # then: tinycloud
npx @cloudglue/tinycloud                # or run directly
```

The npm package is a small launcher: on first run it downloads the matching
platform distribution from Cloudglue's CDN (cached under
`~/.tinycloud/versions/<version>/`), verifies its checksum, and execs the real
binary. The package version pins the binary version, so
`npx @cloudglue/tinycloud@0.3.12` always runs tinycloud 0.3.12. It also adds two
wrapper commands:

```bash
tinycloud install --version 0.3.12   # pre-download a version
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

Cloud features need a Cloudglue API key. The quickest way is browser sign-in
(0.3.10+) — it provisions a key for you, no copy-paste:

```bash
tinycloud login                             # browser sign-in → provisions & saves a key (0.3.10+)
# or paste a key yourself:
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

## Commands

Cloud commands run through your configured Cloudglue API key (billed per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card)); local and
network commands are free. Every command prints a JSON envelope on stdout (logs
go to stderr) — pass `--json`.

| Command | What it does |
|---|---|
| `watch` | Analyze a video → reusable cached context + Cloudglue-ready ref |
| `see` | Analyze an image → reusable cached context + Cloudglue-ready ref (JPEG/PNG/WebP) |
| `extract` | Pull structured facts, entities, or moments from a video or image (free-form or JSON-schema) |
| `caption` | Subtitles and transcripts (SRT/VTT/ASS) |
| `search` | Keyword search over cached video context |
| `probe` | Semantic moment/video search over a Cloudglue scope |
| `ask` | Grounded Q&A over one or more videos |
| `clip` | ffmpeg-backed cut, thumbs, stitch, transcode, burn, split, audio, info |
| `grab` | Download a remote video (YouTube, TikTok, Loom, direct) |
| `face` | Detect faces in a video, or match/search a known face, ranked by similarity |
| `library` | Build & query Cloudglue collections (create/add/remove/delete) and browse connectors |
| `jobs` | Poll, wait on, or forget async jobs |
| `workflow` | Run packaged pipeline recipes (see below) |
| `publish` | Publish HTML artifacts as Cloudglue Sites; share videos |
| `setup` | Configure the Cloudglue API key and service connections |
| `login` | Browser sign-in — provisions & saves a Cloudglue API key (0.3.10+) |

A few common invocations:

```bash
# Analyze a video into reusable, cached context + a Cloudglue-ready ref
tinycloud watch ./demo.mp4 --json
# Describe an image — the file-level counterpart of watch (JPEG/PNG/WebP)
tinycloud see ./photo.jpg --json
# Pull structured findings (free-form query here; pass --schema for a fixed shape)
tinycloud extract "key moments with timestamps" ./demo.mp4 --json
# extract also works on an image source (no segment/shot flags on images)
tinycloud extract "on-screen text and key objects" ./photo.png --json
# Subtitles plus a markdown transcript
tinycloud caption ./demo.mp4 --format srt --transcript --json
# Trim a clip locally — no upload, ffmpeg-backed
tinycloud clip cut ./demo.mp4 --start 12 --end 28 -o clip.mp4 --json
# Grounded Q&A over one or more videos
tinycloud ask "What objections came up?" --in ./demo.mp4 --json
# Detect faces, or match a known face against a video (0.3.4+; query image: JPEG/PNG)
tinycloud face match ./person.jpg ./demo.mp4 --max-faces 10 --json
```

**Collections (0.3.4+)** turn a set of videos into a reusable, queryable
knowledge base. Build one and query it — every type follows the same
`create → add → poll show → query → delete` shape, differing only in `--type`
and the verb that reads it:

```bash
tinycloud library collections create "calls" --type media-descriptions --json
tinycloud library collections add ./call.mp4 --to col_123 --json   # enrichment is async
tinycloud library collections show col_123 --json                  # poll files[].status → completed
tinycloud ask "What did customers object to?" --in collection:col_123 --json
```

`media-descriptions` backs `ask`/`probe`/`search`, `face-analysis` backs
`face list`/`face search`, and `entities` (created with `--prompt`/`--schema`)
backs `library collections entities`.

`tinycloud commands --json` is the authoritative, machine-readable list of
every command and flag. Full per-verb flags and cost classes:
[skills/tinycloud/reference/verbs.md](skills/tinycloud/reference/verbs.md).
The envelope contract — statuses (`ready`, `pending`, `needs_credentials`, …)
and exit codes:
[skills/tinycloud/reference/envelope.md](skills/tinycloud/reference/envelope.md).

### Global flags & profiles (0.3.3+)

A few options are host-level — they isolate state rather than run a video
operation, so they go *before* the verb and don't appear in `commands --json`:

- `--home <dir>` (or `$TINYCLOUD_HOME`) — run against an isolated state home
  (config, sessions, cache, jobs, artifacts, skills) instead of `~/.tinycloud`.
- `--profile <name>` — use a named profile's home, so multiple accounts or
  installs run side by side without cross-contamination.

```bash
tinycloud --home ./.tc watch ./demo.mp4 --json      # isolated state for this repo
tinycloud profile list                              # profiles and their homes
tinycloud profile create work --default             # create one and make it default
tinycloud profile create staging --copy-from work   # clone an existing home
tinycloud --profile work ask "..." --in ./demo.mp4 --json
```

Sessions are scoped per project (keyed by the git root), the agent takes a
`--skills <list>` allowlist alongside `--tools`, and a project-local
`.tinycloud/config.json` can pin tool/skill allowlists and an output base.
Details:
[skills/tinycloud/reference/setup.md](skills/tinycloud/reference/setup.md).

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
