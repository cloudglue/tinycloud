---
name: tinycloud
description: >-
  Deep video and image work via the tinycloud CLI (Cloudglue). Use whenever the
  task involves understanding or manipulating video, audio-visual media, or
  images: analyze or summarize a video, describe or analyze an image, extract
  structured facts/moments/entities from a video or image, generate captions or
  transcripts (SRT/VTT), search inside videos, answer questions about footage,
  cut/stitch/thumbnail/transcode clips, download remote videos, browse Cloudglue
  collections, or run packaged video workflows. Triggers on video files (.mp4,
  .mov, .webm, ...), image files (.jpg, .png, .webp), YouTube/video URLs,
  Cloudglue collections, or any "what's in this video / describe this image /
  make clips / caption this" request. Every command returns a machine-readable
  JSON envelope.
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
(or `export CLOUDGLUE_API_KEY=...`), or, for a human at a terminal,
`tinycloud login` (0.3.10+) for browser sign-in that provisions and saves a key.
Verify with `tinycloud setup --check --json` → `data.ok == true`.

## 1. The envelope contract

Every command emits a Tinycloud envelope on stdout. Logs go to stderr. Fields
you branch on: `status`, `data` (verb-specific payload), `ref` (reusable
source reference), `next` (suggested follow-ups), `setup` (how to fix missing
credentials), `error` (`{code, message, retryable}`).

| status | what you do |
|---|---|
| `ready` | consume `data` / `ref` / file paths and continue |
| `pending` | async job started — `tinycloud jobs wait <meta.job_id> --timeout 120s --json` |
| `needs_credentials` | run the command in `setup.command` (or `setup.login_command`, `tinycloud login`, for browser sign-in — 0.3.10+) or set the env in `setup.env` |
| `needs_upload` | cloud upload required (runs through the user's Cloudglue account) — rerun without `--no-upload` or confirm with the user |
| `needs_download` | fetch locally first: `tinycloud grab <url> --json` |
| `paused` | stop; surface `resume` info to the user (resume is not automated in 0.3.x) |
| `error` | stop; report `error.message`; retry only if `error.retryable` |

Exit codes: 0 = ready/pending/paused, 1 = error, 2 = needs_credentials,
3 = needs_upload/needs_download. Branch on `status`, not exit code alone.
Full schema and error codes: [reference/envelope.md](reference/envelope.md).

## 2. Core verbs (cheat sheet)

Cloud verbs (`watch see extract probe ask publish face`) call the Cloudglue API
using the configured key — usage is billed per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card). `search clip
setup` are local and free; `grab jobs` are network-only.
`tinycloud commands --json` is the authoritative command/flag list.

```bash
# Understand a video (creates reusable cached context + cloud-ready ref)
tinycloud watch ./demo.mp4 --json

# Understand an image — the file-level counterpart of watch (0.3.7+, JPEG/PNG/WebP)
tinycloud see ./photo.jpg --json

# Pipe context into structured extraction (JSONL flows between pipes)
tinycloud watch ./demo.mp4 --json | tinycloud extract "key moments with timestamps" --json
tinycloud extract --schema ./schema.json ./demo.mp4 --segment-level --json
# extract also takes an image source (0.3.7+) — no segment/shot flags on images
tinycloud extract "on-screen text and key objects" ./photo.png --json

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

# Faces on a single video (cloud, 0.3.4+) — for collection-scale face search/list, see Collections below
tinycloud face detect ./demo.mp4 --json                       # every face → normalized box + timestamp
tinycloud face match ./person.jpg ./demo.mp4 --max-faces 10 --json   # query image (JPEG/PNG), ranked 0–100 similarity

# Remote videos, async jobs
tinycloud grab https://youtu.be/<id> -o ./tinycloud-output/grabbed/ --json
tinycloud library connectors sync https://example.com/clip.mp4 --json  # public URL → Cloudglue file (not YouTube — use grab)
tinycloud watch ./long.mp4 --background --json   # returns pending + meta.job_id
tinycloud jobs wait <job-id> --timeout 120s --json

# Collections (0.3.4+) — turn videos into a reusable, queryable knowledge base.
# Lifecycle (every --type): create → add → poll show → query → delete.
tinycloud library collections list --json
tinycloud library collections create my-desc --type media-descriptions --json  # types: media-descriptions | face-analysis | entities (--prompt) | rich-transcripts
tinycloud library collections add ./demo.mp4 --to col_desc --json              # uploads a local source first; enrichment is async (pending)
tinycloud library collections show col_desc --json                            # poll files[].status until completed, then query —
# the collection's --type decides the read verb (each line below is a DIFFERENT, matching-type collection):
tinycloud ask "what's discussed?" --in collection:col_desc --json             #   media-descriptions → ask / probe / search
tinycloud face search ./person.jpg --in collection:col_faces --json           #   face-analysis      → face list / face search
tinycloud library collections entities col_ents ./demo.mp4 --json             #   entities           → collections entities
tinycloud library collections remove cloudglue://files/<id> --from col_desc --json
tinycloud library collections delete col_desc --json

# Publish an HTML artifact to Cloudglue Sites (manage with list / unpublish)
tinycloud publish ./tinycloud-output/html/report.html --name report --visibility private --json
tinycloud publish list --json

# Share a video itself (hosted share page + HLS stream, like a Loom link)
tinycloud publish video ./demo.mp4 --visibility public --json
# Share a single moment — also returns data.moment_url (0.3.5+)
tinycloud publish video ./demo.mp4 --clip-start 18 --clip-end 33 --json
# Hard clip — the share page plays ONLY the moment (0.3.8+)
tinycloud publish video ./demo.mp4 --clip-start 18 --clip-end 33 --clip-only --json
```

Per-verb details and all flags: [reference/verbs.md](reference/verbs.md).
Multi-video batching and pipe semantics: [reference/pipelines.md](reference/pipelines.md).
Evaluating a video the host project's code rendered (render → evaluate →
edit → rerender): the render-review loop in
[reference/pipelines.md](reference/pipelines.md).

Isolation & scope (0.3.3+): `--home <dir>` / `$TINYCLOUD_HOME` and
`--profile <name>` are leading flags (before the verb) that run against an
isolated state home; the agent also takes `--skills <list>` alongside
`--tools <list>`, and a project-local `.tinycloud/config.json` can pin those
allowlists and an output base. Sessions are scoped per project. Details:
[reference/setup.md](reference/setup.md).

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
- Sources: local paths, URLs, `cloudglue://files/<id>` URIs,
  `collection:col_…`, or a bare Cloudglue file-id UUID (normalized to
  `cloudglue://files/<id>`; an existing local path of the same name wins).
- Images (0.3.7+): use `see` to describe an image and `extract` to pull
  structured data from one — **JPEG/PNG/WebP only** (HEIC/GIF/BMP are rejected
  with a "transcode first" hint). `watch <image>` and `caption <image>` error
  and redirect you to `see`/`extract` (an image has no video track to analyze
  or speech to caption); images have no segments, so drop `--segment-level`/
  `--segmentation`/`--shot-*` on an image source. A local image uploads first; a
  public `http(s)` image URL is analyzed in place (no upload). Images can't be
  added to collections. Local `search` can match cached `see` results.
- Do not pass `--background` to `ask`; background jobs exist only for tracked
  async ops (`watch`, `see`, `extract`).
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
- After `publish`, share `data.url` (the stable site link). Fresh content can
  take up to a minute to appear there — a brief 403 right after publishing is
  propagation, not a failure; `data.version_url` serves that exact version
  immediately.
- Never pair a private video share with a public site: private stream URLs
  are signed and short-lived (never hard-code them) — embed via
  `data.embed_snippet` (`<cg-video>`), which only plays on a private site of
  the same account. When writing HTML around an embed, use the component's
  built-ins (`autoplay`+`muted`, `loop`, `start-time`, `exclusive`,
  `playbackrates` — speed-menu rates, default `1 1.5 2`, shown at every
  player size; embed v7 —
  `clip-start`/`clip-end` to frame one "back to moment" clip — plus
  `clip-only`, 0.3.8+, to play nothing but that window; JS
  `playSegment(start, end?)`, `playbackRate` get/set) and the container components
  (`<cg-playlist>`, `<cg-grid>`, `<cg-chapters>`) rather than hand-rolled
  players, galleries, or segment-list JS — details in
  [reference/verbs.md](reference/verbs.md).
- Link previews (0.3.14+): how a pasted link unfurls in Slack/iMessage/Notion.
  A **public** site's card comes from the HTML you generate — put `og:title`,
  `og:description`, `og:image` (absolute URL — a share's `preview_url` works),
  `og:url`, and `twitter:card` in the `<head>` of every public page, or the
  link renders as a bare URL (bots don't run JS; never emit
  `twitter:player`/`og:video`). A **private** site or share never reaches the
  bot, so its card is off by default — opt in with `--link-preview full`
  (private sites also take `--preview-title` / `--preview-image`; a private
  share reuses its own title, description, and thumbnail). ⚠️ Ask the user
  before turning it on: it makes those card fields readable by anyone with the
  link (content and playback stay sign-in gated), and platforms cache per exact
  URL, so turning it back off does not retract posted cards. Details in
  [reference/verbs.md](reference/verbs.md).
- Live-API discovery components (0.3.6+): the same embed script also defines
  collection-scoped, **private-site-only** elements that let viewers search/chat
  inside a published site — `<cg-chat>`, `<cg-search>`, `<cg-deep-search>`,
  `<cg-face-search>` (chat/search/deep-search need a media-descriptions or
  rich-transcripts collection; face-search needs face-analysis). `publish`
  **hard-rejects** them on a public site → publish with `--visibility private`.
  See [reference/verbs.md](reference/verbs.md).

## 5. Reference (load on demand)

- [reference/setup.md](reference/setup.md) — install, credentials, env vars, preflight, profiles & project scope
- [reference/verbs.md](reference/verbs.md) — every verb, flag, and cost class
- [reference/envelope.md](reference/envelope.md) — full envelope schema, statuses, error codes, exit codes
- [reference/pipelines.md](reference/pipelines.md) — pipes, batching, jobs, cache/spend-control flags
- [reference/workflow-authoring.md](reference/workflow-authoring.md) — workflow YAML schema and custom recipes
- [reference/glossary.md](reference/glossary.md) — tinycloud/Cloudglue terms (files, collections, connectors, refs, …)
