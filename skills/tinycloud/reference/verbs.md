# Verbs: commands, flags, and cost classes

`tinycloud commands --json` is the machine-readable source of truth — name,
aliases, summary, cost class, auth requirement, flags, and subcommands for
every verb. Regenerate doubts from it instead of trusting prose.

| Verb | Cost | Auth | Use |
|---|---|---|---|
| `watch` | cloud | yes | Analyze a video → reusable context + Cloudglue-ready ref |
| `see` | cloud | yes | Analyze an image → reusable context + Cloudglue-ready ref (0.3.7+) |
| `extract` | cloud | yes | Pull structured facts, entities, or moments (from a video **or** image) |
| `caption` | varies | no | Subtitles and transcripts (SRT/VTT/ASS) |
| `search` | local | no | Local keyword search over cached context |
| `probe` | cloud | yes | Semantic moment/video search over a Cloudglue-ready scope |
| `ask` | cloud | yes | Grounded Q&A over one or more videos |
| `clip` | local | no | Cuts, thumbs, audio, stitch, split, transcode, burn, explore |
| `grab` | network | no | Download a remote video (YouTube, TikTok, Loom, direct) |
| `face` | cloud | yes | Detect faces in a video, or match/search a query face (0.3.4+) |
| `library` | varies | no | Collections (incl. create/add/remove/delete), connectors, mirrors, sync |
| `jobs` | network | yes | Poll/wait/forget tracked async jobs |
| `workflow` | varies | no | Validate/plan/run workflow recipes |
| `publish` | cloud | yes | Publish HTML/code artifacts as Cloudglue Sites; share videos |
| `setup` | local | no | Credentials and service connections |

Cloud verbs run through the configured Cloudglue API key.
`caption`/`library`/`workflow` vary by what they end up doing.

## Global flags (0.3.3+)

Leading options (placed *before* the verb) and agent-level allowlists, separate
from the per-verb flags below. `--home`/`--profile` and the `profile` verb are
host concerns and are intentionally absent from `commands --json`.

- `--home <dir>` / `$TINYCLOUD_HOME` — run against an isolated state home
  (config, sessions, cache, jobs, artifacts, skills) instead of `~/.tinycloud`.
- `--profile <name>` — use a named profile's home. Managed by
  `tinycloud profile list|show|create|use|remove`
  (`create <name> [--home <dir>] [--copy-from <name>] [--description <text>] [--default]`).
  Unrelated to `watch --profile default|light|custom` (an analysis profile).
- `--skills <list>` (0.3.3+) / `--tools <list>` — comma-separated agent skill /
  tool allowlists (omit = all); also settable per project via
  `.tinycloud/config.json`.

Profiles, project-scoped sessions, and `.tinycloud/config.json`: [setup.md](setup.md).

## Per-verb flags

Flags shared by most verbs are listed once at the bottom.

### watch — analyze a video

```bash
tinycloud watch <source> [--segment uniform:20|chapters|shots|segments]
  [--shot-min-seconds <s>] [--shot-max-seconds <s>]
  [--profile default|light|custom] [--speech-only | --visual-only]
  [--start <t>] [--end <t>] [--transcript] [--content] [--json-index]
  [--background]
```

Shot bounds tune `--segment shots` only: min 0.6–600 (fractional/sub-second
values catch flash frames and rapid cuts), max 1–600, min ≤ max. Out-of-range
or wrong-mode values fail with a validation envelope before any upload. The
bounds are part of the cache key, so tuned and default shot passes never
collide. `watch` is **video/audio only** — point it at an image and it errors
("watch analyzes video/audio; for an image use `tinycloud see`").

### see — analyze an image (cloud, 0.3.7+)

```bash
tinycloud see <image> [--visual-only] [--background] --json
```

The image counterpart of `watch`: file-level image understanding (title +
description + on-screen text) that produces reusable cached context and a
Cloudglue-ready ref. Images are **file-level only** — there is no segmentation,
no shots, no speech/transcript, and no `--start`/`--end` window, so `see` carries
none of those flags (only `--visual-only` to skip the textual read, plus the
shared output/cache/upload/source-reuse flags). Accepts **JPEG, PNG, or WebP**;
other types (HEIC/GIF/BMP/…) are rejected before upload with
`Unsupported image type for see: <name>. Transcode to JPEG, PNG, or WebP first.`
A local image uploads first (`needs_upload` without `--no-upload`); a public
`http(s)` URL that points directly at a JPEG/PNG/WebP image is analyzed **in
place — no upload** (a URL that can't be recognized as a direct image returns
`needs_download` — fetch it first with `grab`). Results cache by source +
options, so re-runs are free.

### extract — structured facts (video or image)

```bash
tinycloud extract "<query>" <source> --json          # free-form query
tinycloud extract --schema ./schema.json <source>    # JSON-schema-shaped output
  [--segment-level] [--segmentation chapters|shots|segments]
  [--shot-min-seconds <s>] [--shot-max-seconds <s>]
  [--include-thumbnails] [--transcript-mode] [--background]
```

`<source>` may be a video **or an image** (0.3.7+) — same JPEG/PNG/WebP rule
and local-upload-vs-URL-in-place behavior as `see`. The segmentation flags
(`--segment-level`/`--segmentation`/`--shot-*`) apply to video only; pass any of
them with an image source and `extract` rejects it before upload
(`Images have no segments — drop --segment-level/--segmentation/--shot-* for an
image source.`). `--shot-min-seconds`/`--shot-max-seconds` work exactly as on
`watch`, against `--segmentation shots`.

### caption — subtitles and transcripts

```bash
tinycloud caption <source> [--format srt|vtt|ass] [--transcript]
  [--diarize] [--word-level] [-o <file-or-dir>]
```

### search — local keyword search (free)

```bash
tinycloud search "<keyword>" [--in <paths|source-ids|collection-ids|all>]
  [--field speech|visual|text|entities] [--limit 50]
```

### probe — semantic search (cloud)

```bash
tinycloud probe "<query>" --in collection:col_… [--scope file|segment] [--limit 20]
```

### ask — grounded Q&A (cloud)

```bash
tinycloud ask "<question>" --in <source|collection:col_…|all>
  [--include-citations[=false]]
```

Never pass `--background` to `ask`.

### clip — local derivatives (free, ffmpeg-backed)

Subcommands: `cut thumbs stitch transcode burn extract-audio split info explore`

```bash
tinycloud clip info <source> --json
tinycloud clip cut <source> --start 12 --end 28 -o out.mp4
tinycloud clip thumbs <source> --interval 5 -o thumbs/
tinycloud clip stitch <a> <b> … -o out.mp4 [--reencode]
tinycloud clip transcode <source> --resolution 1920x1080 [--fps 30] [--preset fast] -o out.mp4
tinycloud clip burn <source> --subtitle-file subs.srt [--subtitle-style <ass-style>] -o out.mp4
tinycloud clip extract-audio <source> --audio-format mp3 -o out.mp3
tinycloud clip split <source> --target-size-mb 50 [--min-chunk-seconds 30] -o chunks/
tinycloud clip explore <source> --title "Explorer" -o explorer.html
tinycloud clip cut --from-findings -o clips/        # cut timestamped findings piped from extract
```

### grab — download remote video

```bash
tinycloud grab <url> [-o <file-or-dir>] [--audio-only] [--format <yt-dlp-selector>]
```

### face — detect & match faces (cloud, 0.3.4+)

```bash
tinycloud face detect <source> [--fps <n>] [--start <t>] [--end <t>]
  [--thumbnails] [--limit <n>] --json
tinycloud face match <image> <source> [--max-faces <n>] [--min-similarity <0-100>]
  [--fps <n>] [--start <t>] [--end <t>] [--thumbnails] --json
tinycloud face list <source> --in collection:col_… [--limit <n>] [--offset <n>] --json
tinycloud face search <image> --in collection:col_… [col_…]
  [--min-score <n>] [--group-by file] [--limit <n>] --json
```

`detect` runs Cloudglue face detection over a video and returns every face as
a normalized 0–1 bounding box (`{top,left,width,height}`) plus a timestamp.
`match` takes a query image — a local file (downscaled and sent inline, **never
uploaded**) or an http(s) URL — and returns the closest faces ranked by a 0–100
`similarity`. The query image must be a **JPEG or PNG** (Cloudglue face matching
decodes only JPEG/PNG — webp/heic/gif/bmp are rejected at preflight; a URL must
likewise point at a JPEG/PNG). Both upload the *video* first like `watch`/`extract`
(`needs_upload` without `--no-upload`) and cache by source + options, so re-runs
are free. `--fps`/`--start`/`--end` tune sampling and window;
`--max-faces`/`--min-similarity` bound `match`, `--limit` bounds `detect`,
`--thumbnails` adds per-face frame URLs.

`list` and `search` operate over a **face-analysis collection** (create one with
`library collections create --type face-analysis` and add videos with
`library collections add`): `list` reads a video's stored detections; `search`
finds the query face across one or more collections (`--min-score`,
`--group-by file`). `total` reports the server-available count across all modes
(never rewritten by client `--min-*`/`--limit` filters).

### library — collections and connectors

```bash
tinycloud library collections list --json
tinycloud library collections show <col_id> --json     # files[].status: pending|processing|completed (readiness)
tinycloud library collections sync <col_id> --artifacts descriptions,transcripts,thumbnails,metadata --json
# Collection writes (0.3.4+) — the only write paths in library:
tinycloud library collections create <name> [--type media-descriptions|entities|rich-transcripts|face-analysis] [--description <text>] [--prompt <text> | --schema <file>] --json
tinycloud library collections add <source> --to <col_id> [--no-upload] [--no-download] --json
tinycloud library collections remove <source> --from <col_id> --json
tinycloud library collections delete <col_id> --json
tinycloud library collections entities <col_id> <source> [--limit <n>] [--offset <n>] --json   # read a video's entities
tinycloud library connectors list --json
tinycloud library connectors files <connector-id> [--limit 25] [--page-token <t>] --json
tinycloud library connectors sync [<connector-id>] <uri-share-link-or-public-url> --json
```

`collections create|add|remove|delete` are the only writes in an otherwise
read-only `library` (gated by the `library.collections.create.v1` /
`library.collections.mutate.v1` feature ids). `create` defaults to
`--type media-descriptions`; an `entities` collection also needs an extraction
spec — `--prompt <text>` or `--schema <file.json>` — or `create` errors. `add`
(`--to <col>`, or `--collection`) resolves the source like `watch`/`extract` —
a local file uploads first (or `needs_upload` with `--no-upload`) — and records
the file→collection mapping; `remove` (`--from <col>`) takes a Cloudglue file
id/uri; `delete` removes the whole collection (and cleans the local mirror).
Collection ids accept a bare uuid, a `col_…` slug, or `collection:<id>` /
`cloudglue://collections/<id>` forms, consistently across read and write paths.

**Readiness — always poll before querying.** `add` enriches each file
asynchronously and returns `pending`. Poll `collections show <col> --json` and
wait until every `files[].status` is `completed` (`pending → processing →
completed`; `failed` is terminal) — a query before then returns empty or errors.

The collection's `--type` decides which verb reads it (every type follows the
same `create → add → poll show → query → delete` lifecycle):

| `--type` | read with |
|---|---|
| `media-descriptions` (default) | `ask` / `probe` / `search` (`--in collection:<col>`) |
| `face-analysis` | `face list` / `face search` |
| `entities` (needs `--prompt`/`--schema`) | `library collections entities <col> <source>` |
| `rich-transcripts` | `collections sync --artifacts transcripts` |

`collections entities <col> <source>` returns a video's extracted entities
(video- and segment-level, `--limit`/`--offset`) from an `entities` collection.
For a one-off per-video pull without standing up a collection, `extract` returns
entities/facts directly (free-form query or `--schema`).

`connectors sync` materializes its argument into a Cloudglue file without
starting analysis (idempotent). The connector id is optional — with just a
URI or link, sync routes through the matching connector type. Connector URIs
(`grain://recording/<id>`, `gdrive://file/<id>`, `dropbox://<path>`,
`zoom://uuid/<uuid>`, `s3://<bucket>/<key>`, …) and share links are accepted:
Dropbox file share links sync server-side via the connector's OAuth
(including login-gated links); `zoom.us/rec/share` links resolve best-effort
(Zoom mints a new token per copy — the recording-detail link is the reliable
form). Link warnings are advisory and surface in `data.warnings` rather than
blocking the sync. Non-connector public URLs (direct media URLs, TikTok,
Loom, public Dropbox links without a connector) sync into a standalone
Cloudglue file via direct URL ingestion — same command, no connector needed.
YouTube URLs cannot sync; use `tinycloud grab` instead.

`connectors files` also takes provider-specific filters: `--from`/`--to`
(Zoom, Grain dates), `--folder-id` (Google Drive), `--path` (Dropbox),
`--bucket`/`--prefix` (S3/GCS), `--title-search`/`--team`/`--meeting-type`
(Grain). Collection IDs (`col_…`) are stable; collection names are
display-only.

### jobs — async work

```bash
tinycloud jobs list [--status pending|running|completed|failed] [--limit N] --json
tinycloud jobs poll <job-id> --json
tinycloud jobs wait <job-id> --timeout 120s --json
tinycloud jobs forget <job-id> --json
```

### workflow — packaged recipes

```bash
tinycloud workflow list --json
tinycloud workflow validate <name-or-path.yaml> --json
tinycloud workflow plan <name-or-path.yaml> <source> --json    # free, no side effects
tinycloud workflow <name> <source> [--param k=v] [--segment <s>] [--out <dir>]
  [--allow-command | --no-command] [--max-parallel N] [--yes] --json
```

`workflow status` and `workflow resume` are NOT implemented in 0.3.x.

### publish — Cloudglue Sites

```bash
tinycloud publish <html-file-or-dir> [--name <site-name>]
  [--visibility public|private] --json
tinycloud publish list --json                       # sites for this account, with URLs
tinycloud publish unpublish <site-ref> --json       # site_id, site name, or the --name label
```

`public` = anyone with the link; `private` = Cloudglue account members only
(same URL, edge-gated). Default keeps the site's current visibility.
Republishing identical content makes no network calls; flipping visibility
patches without re-uploading. `list`/`unpublish` are gated by the
`publish.manage.v1` feature id.

The returned `data.url` is the stable site link (`{name}.cloudglue.site`) —
share that one. It can take up to a minute to serve fresh content after a
publish (a brief 403 there is propagation, not a failure); `data.version_url`
is a permalink to that exact version and is live immediately. `publish list`
rows carry `published` (whether a version is live at `url`) and
`site_version_id`; text output marks unpublished sites with
`(no published version)`.

Note: `--name` is a label for the artifact (republishing reuses it) — the
site itself gets a generated name (e.g. `young-fire-2486`) shown by
`publish list`. `unpublish` resolves any of: the `site_id` UUID, the
generated site name, or your `--name` label.

### publish video — share a video

```bash
tinycloud publish video <source> [--visibility public|private]   # default public
  [--name <title>] [--segment-id <id>] [--clip-start <s> --clip-end <e>] --json
tinycloud publish video list [--in <source>] [--visibility public|private] --json
tinycloud publish video unpublish <share-id | source> --json   # --visibility disambiguates
```

Wraps a Cloudglue file in a shareable asset — a stable hosted share page
(`data.share.share_url`) plus an HLS stream. Local sources upload first (same
prepare step as `watch`). One active share per (file, visibility); re-running
returns the existing share. Stream processing surfaces as a `pending`
envelope — re-run per its `next` hint. Gated by the `publish.video.v1`
feature id.

- Public: `data.share.stream_url` is plain HLS usable anywhere players
  support it — bare `<video>` tags only play HLS in Safari.
- Private: only account members can watch; stream URLs are signed and
  short-lived (redacted in machine output — never hard-code them). Embed with
  `data.embed_snippet` (a `<cg-video share-id="...">` tag), which only plays
  on a PRIVATE published site of the same account — `tinycloud publish`
  rejects an artifact with a private embed targeted at a public site.
- Moment window (0.3.5+): pass `--clip-start <s> --clip-end <e>` (seconds,
  `clip-end > clip-start >= 0`, both required together or the command errors)
  to also get `data.moment_url` — the hosted share page bounded to
  `[start, end]`, with the same length badge, region strip, and "↺ Back to
  moment" pill as the `<cg-video>` clip embed, and it survives the
  private-share sign-in. Optional — omit it for a plain full-video share. The
  same window is just `?s=<start>&e=<end>` appended to a `share_url`, so you
  can hand-build a moment link from an existing share without re-publishing.

When generating custom site HTML around a `<cg-video>` embed, use the
component's built-ins instead of reinventing them. It defaults to a
responsive 16:9 dark placeholder (override with plain page CSS on the
`cg-video` selector); mount-time attributes: `autoplay` (pair with `muted` or
browsers block it), `loop`, `start-time`, `poster`, `accent-color`, and
`exclusive` (put it on every player in a gallery so starting one pauses the
rest). Its JS API queues until ready — `playSegment(start, end?)`,
`seekTo()`, `play()`/`pause()` — and media events are re-dispatched on the
element (`timeupdate`, `ended`, `cg-ready`); prefer `playSegment` over
hand-rolled seek logic for "click a moment to play that segment" pages.

To frame a single moment inside the full recording — a cited highlight you
want to share on its own — add `clip-start`/`clip-end` (seconds) to a bare
`<cg-video>`: the player draws a clip-length badge, a clip-region strip with a
live playhead, snaps the first play to `clip-start`, and auto-pauses at
`clip-end` (via `playSegment`). Scrubbing out of the window fades in a soft
"↺ Back to moment" pill — a manual scrub-out is never forced back. Both are
required and `clip-end` is ignored unless it is greater than `clip-start`; the
pair is `<cg-video>`-only (not read on `<cg-playlist-item>`/`<cg-grid-item>`).
Rule of thumb: one moment → `clip-start`/`clip-end` on a `<cg-video>`; several
segments a viewer navigates between → `<cg-chapters>` (below).

For multi-video or segment-navigation pages, prefer the container components
over hand-rolled galleries and segment-list JS:

- `<cg-playlist>` + `<cg-playlist-item share-id="…">` — one player plus a
  clickable track list, with auto-advance.
- `<cg-grid>` + `<cg-grid-item share-id="…">` — lazy poster-card gallery,
  inline or lightbox modal, at most one live player.
- `<cg-chapters>` + `<cg-chapter start="…" [end="…"]>` — segment navigation
  bound to a player by id; an `end` attribute plays just that clip via
  `playSegment`. Hand-rolled `playSegment` calls remain the fallback for
  fully custom layouts.

Share ids inside `<cg-playlist-item>`/`<cg-grid-item>` tags count toward the
private-embed guard: `tinycloud publish` rejects an artifact embedding a
private share — directly or through a container — on a public site. The full
reference ships with the binary as `references/cg-video.md` inside the
bundled media-artifact skill (under the install's `skills/` directory).

Discovery components (live API, 0.3.6+): the same `/__cg/embed.js` script also
defines four **collection-scoped** components that let a viewer search or chat
*inside* a published site and play the referenced moment inline via `<cg-video>`
— `<cg-chat>` (conversational Q&A, streaming answers + inline moment citations;
optional `placeholder`), `<cg-search>` (keyword/transcript text search),
`<cg-deep-search>` (agentic semantic search), and `<cg-face-search>` (upload or
paste a face image → matching moments). Each takes `collection="<id>"` (plus
optional `accent-color` and `--cg-height` CSS sizing); the collection's `--type`
must match the element — `<cg-chat>`/`<cg-search>`/`<cg-deep-search>` need a
`media-descriptions` or `rich-transcripts` collection, `<cg-face-search>` needs a
`face-analysis` collection. Unlike the playback elements they carry **no share
id**, but their live calls are refused on a public site, so `tinycloud publish`
**hard-rejects** a page that embeds any of them on a public site — publish with
`--visibility private`. End to end: build a collection of the right type
(`library collections create … --type …` → `library collections add` → poll
`library collections show` until each file is `completed`) → author HTML with
the component → `tinycloud publish <html> --visibility private`. Full reference
plus a kitchen-sink page wiring every component (props, JS API, events) ships
with the binary as `references/cg-video.md` and `references/kitchen-sink.html`
inside the bundled media-artifact skill.

### setup — credentials

```bash
tinycloud setup --check --json      # probe configured services (exit 0 always)
tinycloud setup --list --json       # known services
tinycloud setup cloudglue --api-key <key>   # or --stdin
```

## Shared flags

Output: `--json` (force JSONL envelopes), `--pretty` (one JSON array),
`--text`, `--format json|text|tsv`,
`--view envelopes|segments|findings|citations|outputs|matches`,
`--data raw`, `--raw-output` (raw backend payload; disables pipe protocol),
`--quiet`, `--verbose`.

Cache — on `watch`, `see`, `extract`, `caption`, `face`, and `workflow` only:
`--refresh` (recompute), `--no-cache` (no persistence), `--cached` (reuse
exact-match history). `ask`/`probe` always call the cloud; use `search` for a
free cached lookup.

Upload/download refusal — on every verb that resolves a source:
`--no-upload` (refuse cloud upload → `needs_upload`) on `watch`/`see`/`extract`/
`caption`/`face`/`workflow`/`publish` and `library collections add`;
`--no-download` (refuse local materialization → `needs_download`) on the same
set minus `publish`.

Source reuse (`watch`/`see`/`extract`/`caption`): `--source-id <id>`, `--result-id <id>`.

Sources: local paths, URLs, `cloudglue://files/<id>` URIs,
`collection:col_…`, or a bare Cloudglue file-id UUID — bare ids are
normalized to `cloudglue://files/<id>` (an existing local path of the same
name wins), so file ids echoed in tinycloud output can be passed straight
back as sources or `--in` scopes.
