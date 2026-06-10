# End-to-end test results — tinycloud 0.3.0 distribution

Date: 2026-06-09 · Platform: macOS (darwin-arm64) · Tester: Claude Code session

**Binary under test:** rebuilt distribution tarball `tinycloud-darwin-arm64.tar.gz`
(`version 0.3.0`, `git_sha b935592`, `command_spec_revision 91e1a628954e`) —
this is the source branch tip, not yet on the CDN. Credentials: real Cloudglue
API key from `~/.tinycloud/config.json`. Test media: real videos in
`~/temp-project/` (cloud calls below spent actual Cloudglue credits).

## Contract verification (repo vs rebuilt binary)

| Check | Result |
|---|---|
| `--version --json` fields + 16 feature ids vs `tinycloud-skill.json` / `preflight.sh` | ✅ identical to the contract the PR was authored against |
| `scripts/smoke-test.sh` (15 assertions: version, setup --check, commands, workflow list/validate ×6) | ✅ all pass |
| `preflight.sh` states: missing binary / no creds / real creds / pre-0.3.0 binary | ✅ exit 10 / 13 / 0 / 11, one actionable line each |
| Bundled scaffolder (`skills/skill-creator/scripts/init-skill.js`) → `workflow validate` | ✅ scaffolded recipe validates `ready` |
| Tarball structure (binary, bin/, 7 bundled skills, workflows/) | ✅ unchanged |

## Core verb flows (general `tinycloud` skill)

All commands run from `~/temp-project` exactly as the skill documents them,
parsing the JSON envelope from stdout.

| # | Command (arguments used) | Time | Result |
|---|---|---|---|
| 1 | `tinycloud clip info ./tokyo-tower.mp4 --json` | 10s | ✅ `ready` — `{duration_seconds: 7.534, 720x1252, h264, 30fps}` |
| 2 | `tinycloud watch ./tokyo-tower.mp4 --json` | 1m23s | ✅ `ready`, `ref.cloud_ready: true`, fresh cloud analysis |
| 3 | `tinycloud watch ./tokyo-tower.mp4 --json \| tinycloud extract "key moments with timestamps and the overall mood" --json` | 35s | ✅ pipe protocol works; `meta.cache: {identity: hit, enrichment: written}` — no re-upload |
| 4 | `tinycloud ask "What landmark is shown and how do the people feel about it?" --in ./tokyo-tower.mp4 --json` | ~30s | ✅ grounded answer names Tokyo Tower + the unimpressed reaction |
| 5 | `tinycloud search "tower" --in ./tokyo-tower.mp4 --json` | <2s | ✅ 1 match from local cache, zero cloud calls |
| 6 | `tinycloud caption ./tokyo-tower.mp4 --format srt -o ./tinycloud-output/captions/ --json` | ~20s | ✅ valid SRT written with timed cues |
| 7 | `tinycloud clip thumbs ./tokyo-tower.mp4 --interval 3 -o ./tinycloud-output/thumbs/ --json` | 5s | ✅ 3 JPGs |
| 8 | `tinycloud clip cut ./tokyo-tower.mp4 --start 2 --end 5 -o ./tinycloud-output/tokyo-cut.mp4 --json` | 4s | ✅ 625 KB clip |

Example envelope (test 2, `watch`):

```json
{"status": "ready", "summary": "Two young women visit Tokyo Tower but express a lack of
enthusiasm about the popular tourist attraction. ...", "ref": {"cloud_ready": true},
"data": {"title": "...", "summary": "...", "duration_seconds": 7.534, "segments": [...]}}
```

## Workflow skills (run exactly per each SKILL.md)

Each: `workflow validate <name> --json` → `workflow plan <name> <source> --json`
(both free, verified `ready`) → run. Outputs read from `data.outputs.html` and
`data.artifacts[].path`, as the skills instruct.

| Skill | Source (size) | Command | Time | Output |
|---|---|---|---|---|
| blog-post | `howto.mp4` (2 MB, fresh) | `tinycloud workflow blog-post ./howto.mp4 --allow-command --json` | 2m15s | ✅ `completed` → `runs/run_blog-post/blog-post.html` (9.7 KB, title "How to Create Images with ChatGPT", sections + 2 thumbnails) |
| ad-analysis | `Tovala Two Ovens Meta 9x16.mp4` (23 MB, previously analyzed) | `tinycloud workflow ad-analysis "./Tovala Two Ovens Meta 9x16.mp4" --allow-command --json` | **1.7s** | ✅ `completed` → `ad-analysis.html` (32 KB, "Tovala Labor Day Sale — Ad Analysis") — full cache hit, zero re-spend |
| sales-coaching | `Sales Meeting 4.mp4` (83 MB, previously analyzed) | `tinycloud workflow sales-coaching "./Sales Meeting 4.mp4" --allow-command --json` | **3.9s** | ✅ `completed` → `sales-coaching.html` (89 KB, "LedgerUp Platform Demo and Integration Discussion") — cache hit across describe + 2 extracts |
| youtube-publish | `howto.mp4` (2 MB) | `tinycloud workflow youtube-publish ./howto.mp4 --allow-command --json` | 1m19s | ✅ `completed` → `youtube-publish.html` (11 KB) + SRT under `captions/`; describe reused from blog-post run, extract/thumbnails/captions fresh |

The cached runs are the headline result: a workflow re-run on already-analyzed
media completes in seconds with `data.status: completed` and every step `ready`
— exactly the behavior the skills document via `meta.cache`.

## tinycloud-skill-creator

```bash
node "$(dirname "$(command -v tinycloud)")/skills/skill-creator/scripts/init-skill.js" \
  video-mood-report --description "Summarize a video's emotional tone into a one-page HTML report" \
  --dir /tmp/e2e/custom-skills --pattern workflow
tinycloud workflow validate .../video-mood-report.yaml --json   # → ready, problems: []
tinycloud workflow plan .../video-mood-report.yaml ./tokyo-tower.mp4 --json  # → ready, steps: context→fields→render
```

✅ Scaffold → validate → plan all pass without edits.

## Skills driven by real agents (headless)

Skills copied verbatim from this repo into each agent's skills directory, then
the agent was asked to "run the tinycloud skill's preflight, then describe
./tokyo-tower.mp4 preferring cached results."

**Claude Code** (`.claude/skills/`, `claude -p --allowedTools "Bash,Read,Glob,Grep,Skill"`): ✅
ran preflight (quoted the exact `preflight: ok — tinycloud 0.3.0 ready` line),
noticed both cache layers hit ("no cloud spend"), produced a correct
description — and **caught a doc bug**: it reported that `ask --cached` (used
in one reference example) doesn't exist in 0.3.0.

**Codex CLI 0.137** (`.agents/skills/`, `codex exec`): ✅ same flow — preflight
line quoted exactly, correct cached description of the video.

### Finding fixed during testing

`commands --json` confirms the cache/spend flags (`--cached`, `--refresh`,
`--no-cache`, `--no-upload`, `--no-download`) exist only on `watch`,
`extract`, `caption`, and `workflow` — not on `ask`/`probe`.
`reference/pipelines.md` and `reference/verbs.md` were corrected to scope the
flags and point to `search` for free cached lookups.

## Not covered (and why)

- `probe`, `library connectors`, `publish`, `jobs --background` — need
  collection/connector setup or create public artifacts; the verbs are
  asserted present via `commands --json` and smoke tests.
- Live-CDN installs of 0.3.0 — pinned tarballs/manifest not uploaded yet
  (tracked in the PR; CI legs flip on when they land).
