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
| `query` | cloud | yes | Analytical SQL / natural-language queries over collection structured data (0.3.17+) |
| `clip` | local | no | Cuts, thumbs, audio, stitch, split, transcode, burn, explore |
| `grab` | network | no | Download a remote video (YouTube, TikTok, Loom, direct) |
| `face` | cloud | yes | Detect faces in a video, or match/search a query face (0.3.4+) |
| `moments` | cloud | yes | Sweep a whole video against a rubric you wrote, keeping every window that qualifies (0.3.23+) |
| `library` | varies | no | Collections (incl. create/add/remove/delete), connectors, mirrors, sync |
| `jobs` | network | yes | Poll/wait/forget tracked async jobs |
| `workflow` | varies | no | Validate/plan/run workflow recipes |
| `publish` | cloud | yes | Publish HTML/code artifacts as Cloudglue Sites; share videos |
| `setup` | local | no | Credentials and service connections |
| `login` | network | no | Browser sign-in → provisions & saves a Cloudglue API key (0.3.10+) |

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
  [--start <t>] [--end <t>] [--transcript] [--content]
  [--describe-prompt <text>] [--background]
```

Shot bounds tune `--segment shots` only: min 0.6–600 (fractional/sub-second
values catch flash frames and rapid cuts), max 1–600, min ≤ max. Out-of-range
or wrong-mode values fail with a validation envelope before any upload. The
bounds are part of the cache key, so tuned and default shot passes never
collide. `watch` is **video/audio only** — point it at an image and it errors
("watch analyzes video/audio; for an image use `tinycloud see`").

`data.segmentation` reports the segmentation that actually produced
`segments[]` (0.3.16+ — earlier binaries mislabeled shots/chapters runs as
`uniform:20`; on those, trust `data.describe.primary_segmentation` instead).
On footage with no detectable cuts (talks, screencasts, locked-off cameras) a
shots run degenerates to max-duration windows — every shot hits
`--shot-max-seconds` (default 300), so boundaries land on exact multiples.
That is shot detection working on cut-less footage, **not** a fallback to
uniform; 0.3.16+ flags it in `data.segmentation_note`. Re-runs are served
from cache — `--refresh` recomputes and `--no-cache` bypasses (no `--home`
workarounds needed).

Segments carry the spoken words (0.3.12+): each segment (and embedded shot)
inlines its overlapping utterances as `speech: string[]`. A source with
speech but no visual segmentation — an audio file, `--speech-only`, a very
short or windowed source — gets uniform 20s speech segments synthesized
(`"segmentation": "uniform:20"`) instead of an empty `segments` list. Caches
written by older versions heal automatically on the next watch or search.

`--transcript` adds the full transcript as `data.transcript` (speaker-labeled
when more than one speaker); `--content` inlines the complete describe
markdown as `data.content`. Both are derived per invocation — they don't
change the cache key and are served on cache hits, so asking for them never
re-runs an analysis. `--json-index` was removed in 0.3.12 (it had long been a
no-op; passing it now errors as an unknown flag).

`--describe-prompt "<text>"` (0.3.25+, feature `describe.prompt.v1`) is
free-form guidance for the description — domain terms and their spellings,
what to pay attention to, output style — capped at 2000 characters and
rejected client-side before any upload when longer. It steers emphasis and
vocabulary across the visual, scene-text, speech, and summary passes. It is
**context, not a constraint**: it cannot make the description report content
that is not in the media, and it never changes the envelope shape (so no
field appears or disappears because of a prompt). To pin down speaker naming
use participants, not a prompt.

Unlike `--transcript`/`--content`, a prompt **does** change the cache key —
Cloudglue keys its own describe cache by the prompt and tinycloud mirrors
that. The same source under a different prompt, or under no prompt, is a
separate run rather than a cache hit, so editing a prompt recomputes instead
of returning the previous description. Budget for that: iterating on prompt
wording bills a new analysis each time. The value comes back on the
describe's `describe_config.prompt`.

### see — analyze an image (cloud, 0.3.7+)

```bash
tinycloud see <image> [--visual-only] [--describe-prompt <text>] [--background] --json
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

`--describe-prompt "<text>"` (0.3.25+) works exactly as it does on `watch` —
free-form guidance, max 2000 chars, part of the cache key.

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

Video/audio only — an image source is rejected ("Images have no speech to
caption — use `tinycloud see` or `tinycloud extract` to read an image's text.").

### search — local keyword search (free)

```bash
tinycloud search "<keyword>" [--in <paths|source-ids|collection-ids|all>]
  [--field speech|visual|text|entities] [--limit 50]
```

Searches cached context locally, including cached `see` image results (0.3.7+),
so a describe you've already run is greppable without another cloud call.
`--field speech` matches the utterances inlined on cached watch segments —
including speech-only/audio watches (0.3.12+; older cache entries heal in
place during the scan, nothing is re-billed).

### probe — semantic search (cloud)

```bash
tinycloud probe "<query>" --in collection:col_… [--limit 20]          # no --scope = AUTO (0.3.20+)
tinycloud probe "<query>" --in collection:col_… --scope file|segment  # force a level
tinycloud probe "<query>" --in collection:col_… --scope file \
  --filter "source_metadata.host_email=kevin@acme.com" --filter "source_metadata.tags*=demo,intro"
```

**Auto scope (0.3.20+, feature `probe.scope.auto.v1`)**: omit `--scope` and
the search picks the right level for the collection itself (and can fan out
to file + segment plans and fuse the results) — so a bare
`probe "<q>" --in collection:<id>` works on media-descriptions, metadata, and
entities collections alike, without knowing the collection's type first. An
explicit `--scope` forces the level and must be supported by the collection:
`metadata` and video-level `entities` collections are file-level
(`--scope segment` errors); segment-level `entities` collections search at
`segment`.

**Entity search (0.3.20+, feature `probe.entities.v1`)**: an `entities`
collection is a first-class probe target — each file's latest completed
extraction is indexed into search documents for free after the extract job.
Video-level extractions surface as file hits; segment-level ones as segment
hits with real start/end times (citations resolve like media segments) —
collections created by `library collections create --type entities` are
segment-level by default, so expect segment hits. Wait
for `files[].searchable_status == "completed"` in `collections show` before
expecting hits. `probe` FINDS entity content; `query` MEASURES it.

`--filter <path[op]value>` (0.3.15+, feature `probe.filters.v1`; repeatable,
ANDed, collection scopes only) narrows the searched set by stored fields
before semantic ranking. Criteria are ANDed — with each other and with any
filters the search plans itself — so they can only narrow results.
Ops: `=` `!=` `>` `<` `~=` (SQL LIKE, `%` wildcards)
`*=` (contains any of `a,b`) `&=` (contains all) `^=` (in). Path prefixes
route the filter: `source_metadata.*` (connector-provided fields — e.g.
`source_metadata.topic` for Zoom, `source_metadata.title` for
Gong/Grain/Iconik, `source_metadata.parties.email` for Gong,
`source_metadata.participants.name` for Grain,
`source_metadata.iconik_metadata.<Field>` for Iconik custom fields — paths
through arrays match when ANY element matches; ISO datetime fields compare as
strings with `<`/`>`), `metadata.*` (user metadata from `collections add
--metadata`), `video_info.duration_seconds|has_audio`, and
`file.filename|bytes|uri|created_at|id`. source_metadata filters are
file-level facts — pair them with `--scope file`. A `metadata` collection is
file-level: probe it with `--scope file` or no `--scope` at all (auto);
explicit `--scope segment` errors.

### ask — grounded Q&A (cloud)

```bash
tinycloud ask "<question>" --in <source|collection:col_…|all>
  [--include-citations[=false]]
```

`ask` accepts the same collection scopes as `probe` — media-descriptions,
rich-transcripts, metadata, and (0.3.20+) entities collections; the answer
grounds itself in whichever document kinds the collection carries.
Never pass `--background` to `ask`.

### query — structured analytics over collections (cloud, 0.3.17+)

```bash
tinycloud query "<question>" --in collection:col_… [--in collection:col_…]   # NL → SQL
tinycloud query --sql "SELECT …" --in collection:col_… [--max-rows <n>] [--dry-run]
tinycloud query "<question-or---sql>" --in collection:col_… --export csv|jsonl [-o <path>] [--background]
tinycloud query schema --in collection:col_…        # ALWAYS first: what's queryable
tinycloud query list [--status completed|failed|in_progress|cancelled] [--limit <n>] [--offset <n>]
tinycloud query show <query-id> [-o <path>]         # re-fetch a stored run; -o downloads an export
tinycloud query cancel <query-id>                   # abort an in-flight export (refunds)
```

Where `probe`/`ask` FIND content semantically, `query` MEASURES it (features
`query.v1`/`query.export.v1`): a single read-only SQL `SELECT` — or a plain-
English question compiled to SQL server-side — over three virtual tables
built per request from the `--in` collections (repeatable, up to 20; joins
across collections work):

- `files` — one row per (file, collection): `filename`, `title`, `uri`,
  `source`, `created_at`, `bytes`, `duration_seconds`, `width`/`height`,
  `has_audio`, plus `metadata` (user metadata) and `source_metadata`
  (connector fields) as JSON columns.
- `entities` — file-level extracted fields as (`field`, `value`,
  `value_text`) rows.
- `segment_entities` — segment-level entities JSON with
  `segment_index`/`start_time`/`end_time`.

The entity tables reflect each file's **most recent completed extraction
only** (re-extraction replaces rows — no double counting), and files without
extractions still appear in `files` — so `LEFT JOIN`, always on **both**
`file_id` and `collection_id` (`USING (file_id, collection_id)`). A
`metadata` collection has no extraction (`extract_schema: null`) — query its
`files.metadata`/`files.source_metadata` columns with
`json_extract`/`json_extract_string`.

**Run `query schema --in collection:col_… --json` before writing SQL** — it
returns the table columns plus each collection's extracted field names,
levels (file vs segment), and verbatim `extract_schema`/`prompt`, i.e. the
JSON paths you need. Standard SQL works (JSON functions, CTEs, window
functions, `date_trunc`); DDL/DML, multiple statements, and
`ATTACH`/`COPY`/`SET`/`PRAGMA` are rejected.

Exactly one of the positional question or `--sql` per run. NL runs return
the compiled statement in `data.sql` — inspect, tweak, resubmit as `--sql`
(which also bills less). NL suits straightforward analytics (counts,
rankings, group-bys); a question that can't compile fails with a clear
error instead of guessing — write the SQL directly for deep nested-JSON
work. `--dry-run` validates/compiles and returns the effective SQL +
output columns without executing (reduced cost; can't combine with
`--export`).

Sync results return inline, capped by `--max-rows` (default 1000, max
10000) — `data.truncated: true` means narrow, aggregate, or export.
`--export csv|jsonl` streams the FULL result server-side to a gzipped
file (2 GB compressed cap; `--max-rows` is rejected with it — bound an
export with SQL `LIMIT` instead) and downloads it to `-o` (default
`./tinycloud-output/exports/`); add `--background` to get a `pending`
envelope immediately and poll `tinycloud query show <id>` (its `-o`
downloads once completed; the download link lives 24h — after that,
re-run the export). Runs are stored server-side: `list`/`show` browse
them (list rows omit columns/rows), `cancel` aborts an in-flight export
and refunds its reserved credits.

Billing (per the rate card): sync SQL and NL runs bill per query (NL >
SQL), `--dry-run` bills less, exports reserve credits + a size-based
component; `schema`/`list`/`show`/`cancel` are free. Failed runs are
refunded automatically. Server limits: 20 collections and ~2000 files in
scope per query, 15s execution, 1 concurrent query per account (excess →
429; just retry).

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

### moments — find every moment that meets a rubric (cloud, 0.3.23+)

```bash
tinycloud moments <source> --name <criterion> --instructions "<rubric>" [options] --json
tinycloud moments <source> --criterion '<json|file.json>' [options] --json
tinycloud moments show <job-id> [--limit <n>] [--min-score <n>] [--sort rank|start] --json
tinycloud moments list [--status <s>] [--url <u>] [--limit <n>] --json
tinycloud moments delete <job-id> --json
tinycloud moments search "<text>" --in collection:<col> [--criterion <name>] [--limit <n>] --json
```

`moments` is rubric-driven **discovery**: it sweeps a WHOLE video against a
standard you wrote and persists every window that qualifies. It is the fourth
retrieval shape and the easiest to reach for by mistake — keep them apart:

| Verb | What it does |
|---|---|
| `probe` / `ask` | FIND content semantically |
| `extract` | pull declared fields from known places |
| `search` | local keyword grep over cached context |
| **`moments`** | **measure a whole video against a rubric, keeping every hit** |

**The criterion.** `--name` is a lowercase snake_case identifier
(`^[a-z][a-z0-9_]*$`, max 64) — anything else is rejected client-side, because
the API answers a bad name with a bare "Field(s) in the request are invalid"
that names no field. `--instructions` is the rubric prose. For a richer rubric,
`--criterion '<json|file.json>'` takes `{name, instructions, moment_schema,
finding_schema, anchors, scoring}` — `moment_schema` declares typed fields on
every moment, and one `scoring` key populates each moment's `criterion_score`.
The criterion is snapshotted and hashed onto the run (`criterion_hash`), so
editing a rubric produces a different run rather than reinterpreting an old one.

**Run options.** `--describe-job` pins a describe (otherwise a compatible one is
reused or created — a video with no describe is never an error); `--boundary
sentence|tight|loose` (default sentence) sets how generously edges are drawn;
`--signals` (default `speech`) sets the evidence a moment must rest on;
`--speakers`, `--min-duration`, `--max-duration` narrow acceptance; `--refresh`
forces a fresh sweep; `--background` returns `pending` with a poll hint.

**`--limit` / `--min-score` / `--sort` are READ-TIME shaping, not selection.**
Every accepted moment stays persisted and `data.run.total_moments` always
reports the FULL accepted count — a narrowed read never means "that was all".
Re-read the same run with `moments show <job-id>` and different shaping instead
of re-running it.

**Findings** are the non-temporal counterpart (`kind: absence | observation`):
what the rubric established about the video as a whole, including that an
expected thing never happened.

`moments delete` on an IN-FLIGHT run cancels and refunds it; deleting a
COMPLETED run is not refunded.

**Moments collections** — a standing rubric over many videos:

```bash
tinycloud library collections create "sales-calls" --type moments \
  --name objection_handling --instructions "An objection and the rep's response." --json
tinycloud library moments attach <col> --name pricing_pushback --instructions "…" [--boundary tight] --json
tinycloud library moments list <col> [--criterion <name>] [--min-score <n>] [--sort position|criterion-score|rank] --json
tinycloud library moments findings <col> [--criterion <name>] [--kind absence|observation] --json
tinycloud library moments detach <col> <attachment-id> --json
```

A moments collection's criteria run over every current **and future** member, so
adding a video sweeps the standing rubrics over it automatically. **At least one
criterion is REQUIRED at create** — the type alone is rejected; `--criterion`
also accepts an ARRAY of rubrics.

**Billing:** attaching a criterion is free; the per-file backfill runs it starts
are billed as they execute, and a matching prior run (same rubric hash + file)
satisfies a pair with no extra execution. Ask the user before attaching to a
large collection. Track progress via `backfill_status` / `files_completed` /
`files_total` on `collections show`.

`--sort criterion-score|rank` **requires `--criterion <name>`** — scores only
compare within one rubric, and the guard is client-side so it never reaches the
API as an opaque 400. `moments detach`, and removing a file, drop the affected
moments from COLLECTION ENUMERATION only; the underlying runs persist as job
history and stay readable through `tinycloud moments`.

**Searching moments** uses `moments search`, NOT `probe --scope moment` — probe
runs on deep search, whose scope levels are only `file` and `segment`. As of
spec v0.7.23 the `query` verb has no moments virtual tables and `ask`/responses
have no moment awareness, so moments are discoverable and searchable but not yet
countable via `query`. On pre-0.3.23 binaries the whole verb is an
unknown-command error.

### library — collections, connectors, and bulk imports

```bash
tinycloud library collections list --json
tinycloud library collections show <col_id> [--limit <n>] [--page-token <t>] --json   # files[].status: pending|processing|completed (readiness)
tinycloud library collections sync <col_id> --artifacts descriptions,transcripts,thumbnails,metadata --json
# Collection writes (0.3.4+) — the only write paths in library:
tinycloud library collections create <name> [--type media-descriptions|entities|rich-transcripts|face-analysis|metadata|moments] [--describe full|speech|light|<comma-list>] [--describe-prompt <text>] [--description <text>] [--prompt <text> | --schema <file>] [--name <criterion> --instructions "<rubric>" | --criterion <json|file.json>] --json
tinycloud library collections add <source> --to <col_id> [--metadata '<json|file.json>'] [--no-upload] [--no-download] --json
tinycloud library collections remove <source> --from <col_id> --json
tinycloud library collections delete <col_id> --json
tinycloud library collections entities <col_id> <source> [--limit <n>] [--offset <n>] --json   # read a video's entities
tinycloud library connectors list --json
tinycloud library connectors files <connector-id> [--limit 25] [--page-token <t>] [--path <folder> [--recursive]] --json   # --recursive: Dropbox subtree (0.3.22+)
tinycloud library connectors inspect [<connector-id>] <uri-or-share-link> --json   # metadata peek, no file created (0.3.11+)
tinycloud library connectors refresh <file-id|cloudglue-uri|connector-url> --json  # re-fetch stored source_metadata (0.3.15+)
tinycloud library connectors sync [<connector-id>] <uri-share-link-or-public-url> --json
# Bulk imports (0.3.21+) — load a whole connector corpus in one run. Into a METADATA
# collection: source_metadata only, free. Into ANY OTHER type: the media itself, BILLED PER FILE (0.3.22+).
tinycloud library imports create <col_id> --name <name> --connector <connector-id> \
  [--from <date> --to <date> --title-search <t> --folder-id <id> --path <p> --recursive --team <t> --meeting-type <t> \
   | --filters '<json-array|file.json>'] \
  [--mode append|refresh] [--delete-missing] [--rate-limit <n>] [--max-files <n>] [--thumbnails] [--enrich-metadata] [--no-start] --json
tinycloud library imports list <col_id> [--limit <n>] [--offset <n>] --json
tinycloud library imports show <col_id> <import-id> [--limit <n>] [--offset <n>] --json   # run history; PENDING while a run executes
tinycloud library imports run <col_id> <import-id> [--mode append|refresh] [--delete-missing|--no-delete-missing] [--max-files <n>] [--thumbnails|--no-thumbnails] [--enrich-metadata|--no-enrich-metadata] --json
tinycloud library imports cancel <col_id> <import-id> [<run-id>] --json   # no run-id = the latest (only possibly-active) run
tinycloud library imports delete <col_id> <import-id> --json              # imported files always stay
```

`collections create|add|remove|delete` are the only writes in an otherwise
read-only `library` (gated by the `library.collections.create.v1` /
`library.collections.mutate.v1` feature ids). `create` defaults to
`--type media-descriptions`; an `entities` collection also needs an extraction
spec — `--prompt <text>` or `--schema <file.json>` — or `create` errors, and a
`metadata` collection takes NO processing configs (`create` rejects
`--prompt`/`--schema`); a `moments` collection REQUIRES at least one criterion
(`--name`/`--instructions`, or `--criterion` with an object or array) — see
[moments](#moments--find-every-moment-that-meets-a-rubric-cloud-0323).

**A media-descriptions collection indexes only the modalities chosen at
create time, and the API default is speech+summary ONLY** — no visual scene
descriptions, no scene text — so visual `probe`/`ask` queries over a
default-created collection come back empty. `--describe` (0.3.16+, feature
`library.collections.describe.v1`) picks the modalities: `full`
(speech+visual+scene-text+audio+summary — matches a standalone `watch`),
`speech` (the API default, explicit), `light` (speech+visual+summary), or a
comma list from `speech,visual,scene-text,audio,summary`. The choice is
**immutable after create** (the API ignores config updates), so pass
`--describe full` up front when visual search matters; `collections show`
reports the collection's `describe_config`, and the create summary names the
indexed modalities.

`--describe-prompt "<text>"` (0.3.25+, feature
`library.collections.describe.prompt.v1`) adds free-form guidance — domain
terms and their spellings, what to pay attention to — applied when describing
EVERY file in the collection (max 2000 chars). It is fixed at create like
`--describe`, and it may be passed on its own: doing so keeps the Cloudglue
API's default modalities and only adds the guidance, rather than silently
narrowing what gets indexed. It comes back inside `describe_config`, and the
create summary reports it separately from the modality list. Both flags are
media-descriptions-only; on any other `--type` they error, naming the flag you
actually passed. `add`
(`--to <col>`, or `--collection`) resolves the source like `watch`/`extract` —
a local file uploads first (or `needs_upload` with `--no-upload`) — and records
the file→collection mapping; `--metadata '<json|file.json>'` (0.3.15+)
attaches a JSON object of user metadata to the added file, which metadata
collections index next to the connector's `source_metadata`. `remove`
(`--from <col>`) takes a Cloudglue file
id/uri; `delete` removes the whole collection (and cleans the local mirror).
Collection ids accept a bare uuid, a `col_…` slug, or `collection:<id>` /
`cloudglue://collections/<id>` forms, consistently across read and write paths.

**Readiness — always poll before querying.** `add` enriches each file
asynchronously and returns `pending`. Poll `collections show <col> --json` and
wait until every `files[].status` is `completed` (`pending → processing →
completed`; `failed` is terminal) — a query before then returns empty or errors.

`collections show` lists ONE page of files (default 50) with `data.total`,
`has_more`, and `next_page_token` — page with `--page-token` until the token
is null (0.3.16+, feature `library.collections.pagination.v1`; earlier
binaries capped every listing at 50 with a wrong `has_more: false` and a
redacted token, so a >50-file collection could not be enumerated). Each file
row's `status` is the enrichment readiness (poll to `completed` before
querying); on metadata and entities collections rows also carry
`searchable_status` (0.3.20+) — the search-index readiness for the file's
metadata/entity documents (`completed` = findable via `probe`/`ask`; it can
lag `status` briefly while docs index).

The collection's `--type` decides which verb reads it (every type follows the
same `create → add → poll show → query → delete` lifecycle):

| `--type` | read with |
|---|---|
| `media-descriptions` (default) | `ask` / `probe` / `search` (`--in collection:<col>`) |
| `face-analysis` | `face list` / `face search` |
| `entities` (needs `--prompt`/`--schema`) | `library collections entities <col> <source>`; also `probe` / `ask` (0.3.20+ — entities are search-indexed free) |
| `rich-transcripts` | `collections sync --artifacts transcripts` |
| `metadata` (0.3.15+, free) | `probe` / `ask` (file-level; omit `--scope` or use `--scope file`) |

Every type is additionally queryable with `query` (0.3.17+) for analytics —
counts, group-bys, joins over file attributes, user/connector metadata, and
(for `entities` collections) the extracted fields; see the `query` section.

`collections entities <col> <source>` returns a video's extracted entities
(video- and segment-level, `--limit`/`--offset`) from an `entities` collection.
For a one-off per-video pull without standing up a collection, `extract` returns
entities/facts directly (free-form query or `--schema`).

**Metadata collections** (0.3.15+, feature `library.collections.metadata.v1`)
index connector `source_metadata` plus user `--metadata` fields into
file-level search documents WITHOUT downloading or processing the media —
indexing is free and near-instant (no describe/transcribe jobs, so `add`
readiness is quick). Add google-drive, dropbox, zoom, gong, recall, grain, or
iconik URIs/share links (or already-synced files) and query with `probe`
(omit `--scope` for auto, or `--scope file`; explicit segment scope errors)
or `ask`, using `--filter` on
`source_metadata.*`/`metadata.*` paths to narrow. Use one to triage a large
connector library (titles, participants, dates, tags) before paying for full
processing in a `media-descriptions` collection.

**Bulk imports** (0.3.21+, feature `library.collections.imports.v1`) are the
bulk path INTO a collection — never `add`/`sync` files one at a time when a
whole corpus is wanted. `library imports create <col> --name <n> --connector
<id>` saves a definition that lists the connector server-side (google-drive,
dropbox, zoom, gong, recall, grain, iconik — not S3/GCS) and brings every
matching file into the collection.

**What a run ingests follows the TARGET COLLECTION's type**, inferred at
create, fixed for the import's life, and reported as `import_type` on the
definition and on every run:

| Target collection | `import_type` | What a run does | Cost |
|---|---|---|---|
| `metadata` | `metadata` | imports each file's `source_metadata` as a collection file — no media download or processing | **free** (no credits) |
| anything else (`media-descriptions`, `entities`, `rich-transcripts`, `face-analysis`) | `media` | ingests and processes the media itself, exactly like `collections add` | **billed per file** (0.3.22+, feature `library.collections.imports.media.v1`) |

A **media** import counts against the account's file usage limits, so **ask
the user before starting one** and cap it with `--max-files` (media runs also
stop at 10000 files/run whatever `--max-files` says). A media run that
exhausts credits or a usage limit stops with a clear error and keeps
everything it already imported — rerun in `append` mode to resume. On a media
import, `refresh` re-syncs already-imported files' source metadata only;
media bytes are never re-downloaded. The create/run summary names the kind
("Created media import ...") and carries the per-file billing warning, so
read `data.import.import_type` (or the summary) before assuming a run is
free.

The first run starts immediately (`--no-start` saves the definition only),
and `create`/`imports run` return **`pending`** while a run executes — poll
`imports show <col> <import-id>` until the envelope goes `ready` (progress
counters inline: listed, created, updated, skipped, imported, indexed,
enriched, failed, removed), then query with `probe`/`ask`.

Filters are listing passes reusing the `connectors files` flags (`--from`/
`--to` YYYY-MM-DD UTC, `--title-search`, `--folder-id` Drive, `--path`
Dropbox — direct children unless `--recursive` walks the whole subtree
(0.3.22+, feature `library.connectors.recursive.v1`), so a tree is either one
recursive pass or one pass per folder via
`--filters '[{"path":"/a"},{"path":"/b"}]'` — `--team`/`--meeting-type`
Grain); a key the connector can't honor is a clear 400 at create, never
silently dropped, and no filters means one unfiltered pass over everything.
In a `--filters` set, `recursive` is the STRING `"true"`/`"false"`, not a
JSON boolean. Zoom/Gong pin their 6-month default lookback into the stored
filters at create (pass `--from` to control the window); iconik caps 10k
results per filter set (split by date windows). Modes: `append` (default)
imports new files and retries previously-failed ones; `refresh` re-imports
everything matched, and only refresh runs honor `--delete-missing` (removes
ONLY files this import brought in that the source stopped returning; a
`--max-files`-capped run never sweeps). `--rate-limit` tunes upstream
listing requests/sec (per-connector safe defaults, clamped).

`--thumbnails` and `--enrich-metadata` are **metadata-import only** — either
one on a media import is a clear upstream error (imported media gets real
thumbnails from the processing pipeline, and a media run has no
metadata-only record to enrich). `--thumbnails` copies Grain/iconik poster
images (off by default — slows large iconik imports). `--enrich-metadata`
(0.3.22+, feature `library.collections.imports.enrich.v1`; off by default)
backfills source-metadata fields the connector's listing omits, after each
index batch settles: Gong parties + Call Spotlight content (batched, and the
enriched documents are re-embedded so that content becomes searchable) and
Dropbox `media_info` duration/dimensions (per-file). It is a no-op for other
connectors and costs upstream API budget plus, for Gong, embedding work; the
run's `files_enriched` counter reports how many records it backfilled.

Definitions are **immutable** (delete + recreate to change one); **one run
may be active per collection** — triggering while busy errors with a clear
retryable message; `imports cancel` stops the active run (already-imported
files stay) and `imports delete` removes the definition + run history but
never the imported files. On pre-0.3.21 binaries every `imports` subcommand
fails with an unknown-command error — fall back to per-file `collections
add` / `connectors sync`.

`connectors sync` materializes its argument into a Cloudglue file without
starting analysis (idempotent). The connector id is optional — with just a
URI or link, sync routes through the matching connector type. Connector URIs
(`grain://recording/<id>`, `gdrive://file/<id>`, `dropbox://<path>`,
`zoom://uuid/<uuid>`, `iconik://asset/<id>` (0.3.15+), `s3://<bucket>/<key>`,
…) and share links are accepted:
Dropbox file share links sync server-side via the connector's OAuth
(including login-gated links); `zoom.us/rec/share` links resolve best-effort
(Zoom mints a new token per copy — the recording-detail link is the reliable
form). Link warnings are advisory and surface in `data.warnings` rather than
blocking the sync. Synced files carry provider `source_metadata` (title,
participants, summary) for Grain, Zoom, Recall, Google Drive, Dropbox, Gong,
and — on 0.3.15+ — Iconik (whose `source_metadata.iconik_metadata.<Field>`
carries custom metadata-view fields). Non-connector public URLs (direct media
URLs, TikTok,
Loom, public Dropbox links without a connector) sync into a standalone
Cloudglue file via direct URL ingestion — same command, no connector needed.
YouTube URLs cannot sync; use `tinycloud grab` instead.

`connectors files` also takes provider-specific filters: `--from`/`--to`
(dates — every provider except S3/GCS; Zoom and Gong default to the last
6 months; Iconik filters on asset date_created), `--folder-id` (Google
Drive), `--path` (Dropbox — direct children only; add `--recursive` on
0.3.22+ to walk the whole subtree under it, Dropbox only and built for bulk
imports rather than interactive browsing),
`--bucket`/`--prefix` (S3/GCS — bucket required), `--title-search` (Grain,
Zoom, Google Drive, Dropbox, Gong, Iconik), `--team`/`--meeting-type`
(Grain).
Filters a provider can't honor are ignored, and filtered pages can come back
short or even empty while more remain — keep paging until `next_page_token`
is null. On 0.3.11+ each row also carries provider `metadata` (participants,
host, duration, AI summary) when the source exposes it — use it to pick files
before syncing. Collection IDs (`col_…`) are stable; collection names are
display-only.

`connectors inspect <uri>` (0.3.11+, feature `library.connectors.inspect.v1`)
returns one item's provider `source_metadata` WITHOUT materializing a file —
same URI/share-link forms as sync, connector id optional. S3/GCS objects have
nothing richer to inspect. On older binaries it fails with an unknown-command
error — fall back to `connectors sync` (idempotent) and read
`source_metadata` from the sync envelope instead.

`connectors refresh <source>` (0.3.15+, feature
`library.connectors.refresh.v1`) re-fetches an EXISTING file's
`source_metadata` live from its connector, updates the stored value, and
re-indexes any metadata collections the file belongs to — free, no media
downloaded. It takes a file id / `cloudglue://files/<id>` URI / synced
connector URL (not a connector id); only connector-synced files have provider
metadata to refresh. Use it when a recording's title/participants changed
upstream or a metadata collection is serving stale fields. On older binaries
it fails with an unknown-command error — re-running `connectors sync` on the
original URI is the closest (idempotent) fallback, though it does not
re-index metadata collections.

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
  [--visibility public|private]
  [--link-preview none|full|player] [--preview-title <text>] [--preview-image <url>]
  [--preview-share <share-id>] [--route-previews '<json|file>'] --json
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

**Link previews (0.3.14+, `publish.link.preview.v1`)** — how a pasted link
unfurls in Slack, iMessage, Notion, Discord. The two visibilities work
completely differently:

- **Public site** — needs no flags. Its HTML reaches the unfurl bot verbatim,
  so the card *is* whatever Open Graph tags the page carries. **Emit them in
  the `<head>` of every public page you generate** — `og:title`,
  `og:description`, `og:image` (an **absolute** URL — a share's `preview_url`
  works), `og:url`, `twitter:card` — because a regenerated page without them
  silently reverts the card to a bare link. Bots don't run JavaScript, so the
  tags must be in the static HTML. Never emit `twitter:player` or `og:video`
  (unfurlers ignore them for our domains and can degrade the card).
- **Private site** — the edge gate redirects bots to sign-in before any HTML
  is served, so OG tags in the page are never seen and the link unfurls as a
  bare "Sign in" card. Opt in instead with `--link-preview full`, plus
  `--preview-title` (falls back to the generated site name) and
  `--preview-image` (**must be publicly fetchable** — site assets sit behind
  the same gate the bot can't pass, so use a share's `preview_url`; prefer a
  long-lived unsigned URL, since unfurl caches hold the exact URL). The card
  description is the site description. Pass `""` to either flag to clear it.

`--link-preview` is flippable on an **existing** site without republishing
content: the run reports `action: "settings-only"` (a settings PATCH, no
re-upload, no new version). The state comes back as `data.link_preview` (plus
`data.preview_title` / `data.preview_image_url` / `data.preview_share_id`)
and shows in `publish list` rows as `link-preview=full` or
`link-preview=player hero=<id>`. `--preview-title`/`--preview-image` require
`--link-preview full` or `player`, `--preview-share` requires
`--link-preview player`, and a non-absolute `--preview-image` errors before
any upload.

⚠️ **Ask the user before opting a private site in.** `--link-preview full`
makes the card title, the site description, and the card image readable by
anyone who fetches the link — the user-agent check only *routes*; the setting
is the security boundary. Nothing else leaks (no site content, video, tokens,
or cookies; the site stays sign-in gated). Platforms cache per exact URL and
rehost the image, so flipping back to `none` stops *future* unfurls but does
not retract already-posted cards.

**Playable Slack unfurls (0.3.20+, `publish.link.preview.player.v1`)** —
`--link-preview player` upgrades the Slack unfurl from a static card to an
**inline player** (via the Cloudglue Slack app; other platforms still show
the card). It implies the `full` card, so every card rule above applies. A
site plays its **hero share**, set with `--preview-share <share-id>` (a share
id from `publish video`; without one the **site link** unfurls card-only —
per-route heroes are set separately, see `--route-previews` below; pass `""` to
clear). Unlike `full`, `player` matters on **both** visibilities: a public
site's hero must be a **public** share, and a private site's hero plays only
in Slack workspaces the account owner has connected in the Cloudglue
dashboard (Settings → Slack) — everywhere else the link falls back to the
ordinary card. ⚠️ Anyone who can see the Slack message can play the video —
ask the user before opting private content in. Downgrading to `full`/`none`
revokes playback in already-posted unfurls (posted cards are not retracted).

**Per-route unfurl previews (0.3.24+, `publish.link.preview.routes.v1`)** —
a site's pages are usually routes of one HTML document (`#/clip/intro`,
`#/clip/deep-dive`, …), and by default every one of them unfurls with the
SAME site-level card and hero. `--route-previews` gives each route its own:

```bash
tinycloud publish ./site --link-preview player --route-previews '[
  {"route":"#/clip/intro","preview_share_id":"<share-id>","preview_title":"Intro"},
  {"route":"#/clip/deep-dive","preview_share_id":"<share-id>","start_seconds":12,"end_seconds":47}
]' --json

tinycloud publish ./site --link-preview player --route-previews ./routes.json --json
tinycloud publish ./site --link-preview player --route-previews '[]' --json   # clear them all
```

Each entry takes `route` and `preview_share_id` (required) plus optional
`preview_title`, `preview_description`, `preview_image_url`, and a
`start_seconds`/`end_seconds` pair that makes the unfurled player play exactly
that clip. Card fields fall back per field to the hero share's own title (then
filename), description, and thumbnail, so most routes need only
`{route, preview_share_id}`.

⚠️ **The set is replaced wholesale.** Pass the COMPLETE list every publish — a
partial list drops the routes you left out. `'[]'` clears every route preview;
omitting the flag leaves the stored set untouched. Routes match **canonically**
(the `#/` prefix, the query string, and surrounding slashes are stripped), so
`#/clip/intro`, `/clip/intro`, and `clip/intro/` name one route and may appear
only once; the site root is rejected (it always uses the site-level fields).
Heroes must be same-account video shares — on a **public** site, public shares.
The clip window is served with instant clipping that trims at HLS segment
boundaries, so the stream can run up to one segment wider per side than the
window (the poster is the exact `start_seconds` frame); both bounds or neither,
`end_seconds` > `start_seconds`.

`--route-previews` requires `--link-preview player` and is **site-only**
(`publish video` rejects it). ⚠️ Same consent rule per route: anyone who can
see the Slack message can play what that route's hero points at — ask the user
first. The written set comes back as `data.route_previews[]` (canonical
`route`, server `id`, card/window fields), present **only** when the run wrote
it — an absent key means "routes left alone", `[]` means "cleared". A
route-preview-only run on unchanged content reports `action: "settings-only"`
with no re-upload. Deleting a hero **share** reverts its routes to the
site-level unfurl.

### publish video — share a video

```bash
tinycloud publish video <source> [--visibility public|private]   # default public
  [--name <title>] [--segment-id <id>] [--clip-start <s> --clip-end <e> [--clip-only]]
  [--link-preview none|full|player] --json
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
- Hard clip (0.3.8+): add `--clip-only` to a `--clip-start`/`--clip-end` pair
  (it requires both — the command errors before anything uploads) and
  `data.moment_url` ends in `?s=<start>&e=<end>&clip=hard`: the share page
  plays ONLY the moment (trimmed stream; the seek bar is the clip) instead of
  the full video with a "back to moment" overlay. The flag survives the
  pending → re-run flow (the `next` hint carries it), and the same suffix
  works hand-built on an existing `share_url`. Gated by the
  `publish.video.moment.hard.v1` feature id; older share pages ignore
  `&clip=hard` and fall back to the soft window. It shapes the viewing
  experience, not access control — anyone with the bare `share_url` still has
  the whole video; restrict access with `--visibility private`.
- Link previews (0.3.14+): a PUBLIC share page always unfurls in Slack with a
  card built from its title, description, and thumbnail. A PRIVATE share is
  redirected to sign-in before the bot sees anything, so it unfurls as a bare
  "Sign in" card unless you pass `--link-preview full`, which serves bots a
  metadata-only stub built from those same three fields. It comes back as
  `data.share.link_preview`, and re-running flips it on an existing share
  (a PATCH — no new share). Playback outside Slack stays sign-in gated in
  every mode.
  ⚠️ Ask the user first: `full` makes the share's title, description, and
  thumbnail readable by anyone who fetches the link, and platforms cache per
  exact URL, so turning it back off does not retract already-posted cards.
- Playable Slack unfurls (0.3.20+, `publish.link.preview.player.v1`):
  `--link-preview player` on a PRIVATE share lets the share itself play
  inline when its link is pasted in a Slack workspace the account owner has
  connected in the Cloudglue dashboard (implies the `full` card; elsewhere
  the link falls back to the card). A PUBLIC share already unfurls playable
  wherever the Cloudglue Slack app is installed — no flag needed. ⚠️ Anyone
  who can see the Slack message can play the video — ask the user before
  opting a private share in. Downgrading to `full`/`none` revokes playback in
  already-posted unfurls.

When generating custom site HTML around a `<cg-video>` embed, use the
component's built-ins instead of reinventing them. It defaults to a
responsive 16:9 dark placeholder (override with plain page CSS on the
`cg-video` selector); mount-time attributes: `autoplay` (pair with `muted` or
browsers block it), `loop`, `start-time`, `poster`, `accent-color`,
`playbackrates` (speed menu — next paragraph), and
`exclusive` (put it on every player in a gallery so starting one pauses the
rest). Its JS API queues until ready — `playSegment(start, end?)`,
`seekTo()`, `play()`/`pause()`, `playbackRate` (get/set) — and media events
are re-dispatched on the
element (`timeupdate`, `ended`, `cg-ready`); prefer `playSegment` over
hand-rolled seek logic for "click a moment to play that segment" pages.

Playback speed (sites embed v7): every `<cg-video>` shows a playback-speed
menu at every player size — including narrow grid cells and phones — with
default rates `1 1.5 2`. Supply your own list with the space-separated
`playbackrates` attribute (e.g. `playbackrates="0.5 1 1.5 2"`), and get/set
the speed from page code via the `playbackRate` JS property (safe to set
before mount; non-positive and non-numeric values are ignored — the viewer
can always change it from the menu). The speed menu ships in the
Cloudglue-served embed script, so it is not gated on a tinycloud version and
already-published sites pick it up without republishing.

To frame a single moment inside the full recording — a cited highlight you
want to share on its own — add `clip-start`/`clip-end` (seconds) to a bare
`<cg-video>`: the player draws a clip-length badge, a clip-region strip with a
live playhead, snaps the first play to `clip-start`, and auto-pauses at
`clip-end` (via `playSegment`). Scrubbing out of the window fades in a soft
"↺ Back to moment" pill — a manual scrub-out is never forced back. Both are
required and `clip-end` is ignored unless it is greater than `clip-start`; the
pair is `<cg-video>`-only (not read on `<cg-playlist-item>`/`<cg-grid-item>`).
Adding `clip-only` (embed v6, 0.3.8+) hardens the window: the player shows
only the clip, with the timeline re-based to it — no badge, strip, or pill,
because there is nothing to scrub back to. It is honored only alongside a
valid `clip-start`/`clip-end` pair, and older embed scripts ignore it,
degrading to the soft behavior above.
Rule of thumb: one moment → `clip-start`/`clip-end` on a `<cg-video>`
(`clip-only` if viewers should see nothing but the moment); several
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

Live-API components (0.3.6+; expressive surface below is sites embed v8–v12,
taught from 0.3.18): the same `/__cg/embed.js` script also defines
**collection-scoped** components that let a viewer search, chat, query, or
read a transcript *inside* a published site and play the referenced moment
inline via `<cg-video>`. Their implementation loads lazily from a second
chunk (`/__cg/embed-live.js`) the moment a page uses one — automatic; never
emit that file as a script tag, `/__cg/embed.js` stays the only script load.

- `<cg-chat>` — conversational Q&A, streaming answers + inline moment
  citations, built-in Stop button. Optional `instructions` (the per-site
  system prompt — persona, tone, scope) and `placeholder`.
- `<cg-search>` — keyword/transcript text search. Optional tuning: `scope`
  (`segment` | `file`), `modalities`, `label-filters` (space/comma lists),
  `threshold`, `limit`, `group-by="file"`, `sort-by` (`score` |
  `item_count`). Malformed values degrade to defaults, never an error.
- `<cg-deep-search>` — agentic semantic search; the synthesis streams in and
  result cards land as found. Optional `scope`, `limit`,
  `exclude-weak-results`.
- `<cg-face-search>` — upload or paste a face image → matching moments,
  played as short bounded clips. Optional `threshold`, `limit`.
- `<cg-query>` (embed v11) — natural-language analytical question → inline
  table + row count, with the compiled SQL shown under the answer (the
  site-side face of the `query` verb's engine). Optional `max-rows`. Point
  it at an entities or metadata collection — often a **different id** than
  the one chat/search use on the same page.
- `<cg-transcript share-id collection [for]>` (embed v12) — click-to-seek
  speech turns with timestamps + speakers; with `for="<player-id>"` the
  active turn follows the playhead, without it turns open as modal clips.
  Unbilled. Height via `--cg-height`.
- `<cg-chapters auto share-id collection>` (embed v12) — chapters
  self-populate from the live API instead of baked-in `<cg-chapter>`
  children; auto chapters always seek-and-continue. The `auto` attribute
  makes the otherwise public-safe chapters element private-site-only.

Every live panel is restylable from page CSS via `::part()` hooks
(`panel`/`input`/`send`/`status`/`results`, per-card `result*`; chat adds
`log`/`message`(+role)/`bubble`/`citation`/`stop`) and emits host events:
`cg-results`, `cg-answer`, `cg-error` (carries the HTTP status), plus the
**cancelable** `cg-resultopen`/`cg-citationopen` — `preventDefault()` swaps
the built-in clip mount for your own handling (embed v10). A
`window.cloudglue` JS client (responses/search/deepSearch/faceSearch/query/
transcript/sharesForFiles/renderCitations) backs fully custom UIs.

Each collection-scoped element takes `collection="<id>"` (plus optional
`accent-color` and `--cg-height` CSS sizing); the collection's `--type` must
match the element — `<cg-chat>`/`<cg-search>`/`<cg-deep-search>`/
`<cg-transcript>`/`<cg-chapters auto>` need a `media-descriptions` or
`rich-transcripts` collection, `<cg-face-search>` needs a `face-analysis`
collection, `<cg-query>` runs over any non-face collection. Their live calls
are refused on a public site, so `tinycloud publish` **hard-rejects** a page
that embeds any of them on a public site (0.3.18 extends the guard to
`<cg-query>`/`<cg-transcript>`/`<cg-chapters auto>`) — publish with
`--visibility private`. End to end: build a collection of the right type
(`library collections create … --type …` → `library collections add` → poll
`library collections show` until each file is `completed`; for `<cg-query>`,
`query schema --in collection:<id>` shows what's queryable) → author HTML
with the component → `tinycloud publish <html> --visibility private`. Full
reference plus a kitchen-sink page wiring every component (props, JS API,
events) ships with the binary as `references/cg-video.md` and
`references/kitchen-sink.html` inside the bundled media-artifact skill.

### setup — credentials

```bash
tinycloud setup --check --json      # probe configured services (exit 0 always)
tinycloud setup --list --json       # known services
tinycloud setup cloudglue --api-key <key>   # or --stdin
```

### login — browser sign-in (network, 0.3.10+)

```bash
tinycloud login [--no-browser] [--web-url <url>] [--label <text>] --json
```

An OAuth-style **device-authorization** sign-in — the interactive counterpart of
`tinycloud setup cloudglue --api-key`. It prints a short code + a verification
URL, best-effort opens the Cloudglue dashboard, and polls until you approve;
approval mints a normal `cg-` API key that is saved to `~/.tinycloud/config.json`
(0600) exactly like a pasted key. The **raw key is never printed** — the `ready`
envelope's `data` carries only `{account, api_base_url, key_masked, config_path,
replaced_existing}` (progress code + URL go to **stderr**). `--no-browser` prints
the URL only (SSH/containers); `--web-url` (or `$CLOUDGLUE_WEB_URL`) points at a
non-default dashboard; `--label` names the provisioned key (default: hostname).
Revoke by deleting the key in the dashboard. Because it blocks on a
~10-minute human flow, `login` is a manual/onboarding command — don't script it
into an agent's tool loop; for headless/automated setup keep using
`tinycloud setup cloudglue --api-key <key>` or `$CLOUDGLUE_API_KEY`.

## Shared flags

Output: `--json` (force JSONL envelopes), `--pretty` (one JSON array),
`--text`, `--format json|text|tsv`,
`--view envelopes|segments|findings|citations|outputs|matches`,
`--data raw`, `--raw-output` (raw backend payload; disables pipe protocol),
`--quiet`, `--verbose`.

Cache — on `watch`, `see`, `extract`, `caption`, `face`, and `workflow` only:
`--refresh` (recompute), `--no-cache` (no persistence), `--cached` (reuse
exact-match history). `ask`/`probe`/`query` always call the cloud; use
`search` for a free cached lookup (and `query show` to re-fetch a stored
query run for free).

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
