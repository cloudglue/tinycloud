---
name: tinycloud
description: >-
  Deep video work via the tinycloud CLI (Cloudglue). Use whenever the task
  involves understanding or manipulating video or audio-visual media: analyze
  or summarize a video, extract structured facts/moments/entities, generate
  captions or transcripts (SRT/VTT), search inside videos, answer questions
  about footage, cut/stitch/thumbnail/transcode clips, download remote videos,
  browse Cloudglue collections, or run packaged video workflows. Triggers on
  video files (.mp4, .mov, .webm, ...), YouTube/video URLs, Cloudglue
  collections, or any "what's in this video / make clips / caption this"
  request. Every command returns a machine-readable JSON envelope.
---

# Tinycloud: video operations for agents

`tinycloud` is a CLI for video understanding and editing, backed by Cloudglue.
Drive it with shell commands and parse JSON from stdout. Never scrape its
human-readable output; always pass `--json` (single envelope) or rely on JSONL
when piping.

## 0. Preflight (always do this first)

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/preflight.sh
```

(Outside Claude Code, run `scripts/preflight.sh` from this skill's directory.)
It prints exactly one line telling you what to do: install, upgrade, configure
credentials, or proceed. If `tinycloud` is missing entirely:

```bash
npm install -g @cloudglue/tinycloud
# or: curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
```

Credentials (required for cloud verbs): `tinycloud setup cloudglue --api-key <key>`
(or `export CLOUDGLUE_API_KEY=...`). Verify with
`tinycloud setup --check --json` → `data.ok == true`.

## 1. The envelope contract

Every command emits a Tinycloud envelope on stdout. Logs go to stderr. Fields
you branch on: `status`, `data` (verb-specific payload), `ref` (reusable
source reference), `next` (suggested follow-ups), `setup` (how to fix missing
credentials), `error` (`{code, message, retryable}`).

| status | what you do |
|---|---|
| `ready` | consume `data` / `ref` / file paths and continue |
| `pending` | async job started — `tinycloud jobs wait <meta.job_id> --timeout 120s --json` |
| `needs_credentials` | run the command in `setup.command` or set the env in `setup.env` |
| `needs_upload` | cloud upload required (runs through the user's Cloudglue account) — rerun without `--no-upload` or confirm with the user |
| `needs_download` | fetch locally first: `tinycloud grab <url> --json` |
| `paused` | stop; surface `resume` info to the user (resume is not automated in 0.3.x) |
| `error` | stop; report `error.message`; retry only if `error.retryable` |

Exit codes: 0 = ready/pending/paused, 1 = error, 2 = needs_credentials,
3 = needs_upload/needs_download. Branch on `status`, not exit code alone.
Full schema and error codes: [reference/envelope.md](reference/envelope.md).

## 2. Core verbs (cheat sheet)

Cloud verbs (`watch extract probe ask publish`) call the Cloudglue API using
the configured key — usage is billed per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card). `search clip
setup` are local and free; `grab jobs` are network-only.
`tinycloud commands --json` is the authoritative command/flag list.

```bash
# Understand a video (creates reusable cached context + cloud-ready ref)
tinycloud watch ./demo.mp4 --json

# Pipe context into structured extraction (JSONL flows between pipes)
tinycloud watch ./demo.mp4 --json | tinycloud extract "key moments with timestamps" --json
tinycloud extract --schema ./schema.json ./demo.mp4 --segment-level --json

# Captions / transcripts
tinycloud caption ./demo.mp4 --format srt --transcript -o ./tinycloud-output/captions/ --json

# Find things: local keyword search vs cloud semantic search vs Q&A
tinycloud search "pricing" --in ./demo.mp4 --json
tinycloud probe "product demo moments" --in collection:col_123 --scope segment --limit 5 --json
tinycloud ask "What objections came up?" --in ./demo.mp4 --json

# Local editing (free, ffmpeg-backed)
tinycloud clip info ./demo.mp4 --json
tinycloud clip cut ./demo.mp4 --start 12 --end 28 -o ./tinycloud-output/clip.mp4 --json
tinycloud clip thumbs ./demo.mp4 --interval 5 -o ./tinycloud-output/thumbs/ --json
tinycloud clip burn ./demo.mp4 --subtitle-file ./captions/demo.srt -o ./out.mp4 --json

# Remote videos, collections, async jobs
tinycloud grab https://youtu.be/<id> -o ./tinycloud-output/grabbed/ --json
tinycloud library collections list --json
tinycloud watch ./long.mp4 --background --json   # returns pending + meta.job_id
tinycloud jobs wait <job-id> --timeout 120s --json

# Publish an HTML artifact to Cloudglue Sites (manage with list / unpublish)
tinycloud publish ./tinycloud-output/html/report.html --name report --visibility private --json
tinycloud publish list --json
```

Per-verb details and all flags: [reference/verbs.md](reference/verbs.md).
Multi-video batching and pipe semantics: [reference/pipelines.md](reference/pipelines.md).

## 3. Workflows (packaged recipes)

Repeatable pipelines run with one command and write outputs into a run
directory:

```bash
tinycloud workflow list --json
tinycloud workflow validate sales-coaching --json
tinycloud workflow plan sales-coaching ./call.mp4 --json     # resolves the graph; free, no side effects
tinycloud workflow sales-coaching ./call.mp4 --json
```

Parse the final envelope: `data.status` (`completed|partial|failed|paused`),
`data.outputs` (named outputs, e.g. `outputs.html`), `data.artifacts[].path`.
Files land under `./tinycloud-output/runs/<run_id>/`. Recipe render steps run
local scripts: built-in recipes self-permit them (`permissions: [command]`),
so no extra flag is needed; pass `--allow-command` only for a recipe run by
path that lacks that permission. `--no-command` always disables them.
Authoring your own recipes: [reference/workflow-authoring.md](reference/workflow-authoring.md).

## 4. Gotchas

- Machine output is stdout; logs/progress are stderr. Keep stderr visible for
  debugging, but never parse it.
- Built-in recipes already permit their render steps (`permissions:
  [command]`) — don't add `--allow-command` for them (host-agent permission
  classifiers may flag it); it's only needed for path-run recipes without
  that permission.
- Sources: local paths, URLs, `cloudglue://files/<id>` URIs, or
  `collection:col_…` — a bare file-id UUID is not accepted.
- Do not pass `--background` to `ask`; background jobs exist only for tracked
  async ops (`watch`, `extract`).
- `workflow status` / `workflow resume` are not implemented in 0.3.x; treat
  `paused`/`partial` as terminal and surface `resume` metadata to the user.
- `--no-upload` / `--no-download` make commands refuse cloud upload / local
  materialization and return `needs_upload` / `needs_download` instead — use
  them to control spend, then branch.
- Piping: downstream verbs consume JSONL envelopes from stdin; a non-`ready`
  upstream envelope produces a blocked envelope downstream instead of running.
- Keep generated files under `./tinycloud-output/` (override with the
  `--out` flag where supported).
- Cached results are reused automatically; `--refresh` forces re-computation,
  `--no-cache` disables persistence.

## 5. Reference (load on demand)

- [reference/setup.md](reference/setup.md) — install, credentials, env vars, preflight details
- [reference/verbs.md](reference/verbs.md) — every verb, flag, and cost class
- [reference/envelope.md](reference/envelope.md) — full envelope schema, statuses, error codes, exit codes
- [reference/pipelines.md](reference/pipelines.md) — pipes, batching, jobs, cache/spend-control flags
- [reference/workflow-authoring.md](reference/workflow-authoring.md) — workflow YAML schema and custom recipes
- [reference/glossary.md](reference/glossary.md) — tinycloud/Cloudglue terms (files, collections, connectors, refs, …)
