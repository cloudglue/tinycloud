# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **public distribution repo** for tinycloud (an agent CLI for video work,
powered by Cloudglue — https://tinycloud.sh). It does NOT contain tinycloud
itself; the binary is built from a private source repo and served from a CDN
at `https://media.cloudglue.dev/tinycloud-dist/`. This repo ships three
surfaces, and must never depend on the private repo at runtime:

1. **`install.sh`** — shell installer (deployed to `https://app.cloudglue.dev/tinycloud.sh`)
2. **`@cloudglue/tinycloud` npm package** — `bin/tinycloud.js` + `lib/`, a
   zero-dependency launcher that downloads the platform tarball on first run,
   verifies sha256, caches under `~/.tinycloud/versions/<v>/`, and execs the
   real binary
3. **Agent skills** under `skills/` — teach Claude Code/Codex/any
   agentskills.io agent to drive the tinycloud CLI; also exposed as a Claude
   Code plugin via `.claude-plugin/` (plugin source `"./"`, skills discovered
   from `skills/`)

## Commands

```bash
npm test                                  # unit + e2e against a local fixture CDN (fully offline)
node --test test/unit.test.mjs            # just the unit suite
TINYCLOUD_TEST_TARBALL=~/Downloads/tinycloud-darwin-arm64.tar.gz npm test   # e2e against a real dist tarball

# Contract smoke tests against an installed/extracted binary
TINYCLOUD_CMD=/path/to/tinycloud EXPECTED_VERSION=0.3.15 bash scripts/smoke-test.sh

# Serve a tarball as a fake CDN (modes: --corrupt, --no-manifest)
node test/fixtures/make-fixture-cdn.mjs --tarball <path>.tar.gz --version 0.3.15 --port 8787
TINYCLOUD_DIST_URL=http://127.0.0.1:8787 TINYCLOUD_INSTALL_DIR=$(mktemp -d) node bin/tinycloud.js --version --json
TINYCLOUD_DIST_URL=http://127.0.0.1:8787 bash install.sh --install-dir $(mktemp -d)/bin

# Release manifest tooling (maintainer)
node scripts/generate-manifest.mjs --version 0.3.15 --from-cdn   # build manifest + .sha256 sidecars
node scripts/generate-manifest.mjs --check --version 0.3.15      # verify live CDN matches manifest

# Plugin metadata validation
claude plugin validate .
shellcheck install.sh scripts/smoke-test.sh skills/tinycloud/scripts/preflight.sh
```

When testing `install.sh` locally, isolate `HOME` (`HOME=$(mktemp -d) bash
install.sh ...`) — otherwise it appends a PATH line for your temp install dir
to your real shell rc file.

## Architecture

### Version/distribution model

- npm package version == tinycloud binary version, **1:1**. The launcher
  defaults to running its own `package.json` version, so
  `npx @cloudglue/tinycloud@X` deterministically runs binary X. Runtime
  resolution order: `TINYCLOUD_VERSION` env → `~/.tinycloud/wrapper-version`
  (written by `install --latest`/`update`) → package version.
- CDN naming: `tinycloud-<platform>.tar.gz` (latest alias) and
  `tinycloud-<platform>-v<version>.tar.gz` (pinned tarballs are
  **v-prefixed** on the CDN; version strings are bare everywhere else).
  Platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64.
- `manifest.json` on the CDN (`{schema:1, channels:{stable,beta}, versions:{<v>:{platforms:{<p>:{url,size,sha256}}}}}`)
  is the resolution source of truth when present. "Latest" resolves through
  `channels.stable` to a pinned, checksummed URL; channel installs and
  `tinycloud update` are impossible without it.
- **Integrity policy** (identical in both installers): the manifest is an
  optimization, never a requirement — missing OR unusable (network failure,
  5xx, captive-portal HTML, truncated JSON, future schema) degrades with a
  warning to the direct-URL + `.sha256`-sidecar path. Checksum *mismatch*
  always fails closed. `TINYCLOUD_REQUIRE_MANIFEST=1` means
  **verified-or-fail** (unusable manifest or no checksum → hard error).
  Pinned versions missing from the manifest fall back to the conventional
  URL; a `latest` pin falls back to the newest healthy cached install when
  offline. `TINYCLOUD_DIST_URL` rebases the manifest's absolute URLs.
  CloudFront returns **403 for missing S3 keys** — treat 403 and 404 both
  as "missing".
- **Upgrade cleanup is manifest-of-members**: each install.sh run records
  the tarball member list in `<install-dir>/.tinycloud-files` and the next
  install removes exactly those paths (user files anywhere survive). The
  name-allowlist scan is only a legacy fallback for pre-record installs.
- `install.sh` (bash) and `lib/manifest.js` (node) implement the same
  resolution logic; changes to one must mirror the other.
- The launcher chain: `bin/tinycloud.js` (dispatch; owns the
  `install`/`update`/`skills` subcommands — the binary must never add verbs
  with those names; a regression test in the source repo guards this) →
  `lib/platform.js` → `lib/manifest.js` → `lib/download.js` (sha256 computed
  in the same pass as the stream; curl fallback when `HTTPS_PROXY` is set) →
  `lib/installer.js` (extract-then-atomic-rename, `.ok` marker written only
  after verified download + full extraction) → `lib/run.js` (stdio inherit,
  signal forwarding, 128+n exit semantics).
- Gotcha: `TINYCLOUD_INSTALL_DIR` means the *bin dir* to install.sh
  (`~/.tinycloud/bin`) but the *cache root* to the npm launcher (`~/.tinycloud`).

### Binary contract (what everything asserts against)

`tinycloud --version --json` reports `version`, `protocol_version`,
`envelope_schema`, `workflow_schema`, `command_spec_revision`, and
`features[]` (e.g. `workflow.v1`). Every command emits a JSON envelope on
stdout (logs on stderr) with `status`:
`ready | pending | needs_credentials | needs_upload | needs_download | paused | error`
→ exit codes 0/0/2/3/3/0/1. `tinycloud commands --json` is the authoritative
flag list — verify doc claims against it, not memory (a doc bug shipped once
because `--cached` only exists on watch/see/extract/caption/face/workflow). As
of 0.3.23 there are 18 verbs (0.3.17 added `query`, 0.3.23 added
`moments`): `see`
(0.3.7+) analyzes an **image** (file-level,
JPEG/PNG/WebP — the image counterpart of `watch`) and `extract` also takes
an image source (features `see.v1`, `extract.images.v1`); 0.3.8 adds
`publish video --clip-only` (hard clip: `data.moment_url` gains `&clip=hard`
so the share page plays only the moment; feature
`publish.video.moment.hard.v1`); 0.3.10 adds the `login` verb (feature
`login.v1`) — a browser device-authorization sign-in
(`tinycloud login` → best-effort opens the Cloudglue dashboard, mints a normal
`cg-` API key, saves it to config exactly like a pasted key; the raw key never
touches stdout/envelopes/logs). Unlike the host-level `profile` verb, `login`
IS a normal command **present in `commands --json`** (cost class `network`,
`requires_auth: false`) — it is excluded only from the LLM agent's tool set
(it blocks on a ~10-min interactive flow). Paste-key + `$CLOUDGLUE_API_KEY`
remain fully supported. 0.3.11 bumps the bundled Cloudglue SDK to 0.7.19
(connector source metadata for all six metadata-bearing providers — Grain,
Zoom, Recall, Google Drive, Dropbox, Gong) and adds `library connectors
inspect <uri>` (feature `library.connectors.inspect.v1`) — a provider-metadata
peek that never creates a file — plus per-file provider `metadata` on
`connectors files` rows; verbs stay 16 (inspect is a `library` subcommand,
not a verb), features 31→32. 0.3.12 fixes the critical watch speech gap:
`watch --speech-only`/audio sources returned `segments: []` — segments (and
embedded shots) now inline their overlapping utterances as `speech: string[]`,
sources with speech but no visual segmentation synthesize uniform 20s
segments (`segmentation: "uniform:20"`), pre-0.3.12 caches heal automatically
(persisted on watch cache hits; in-memory during search scans), and
`search --field speech` works over cached watches (feature `watch.speech.v1`,
features 32→33, verbs stay 16). It also wires the previously
declared-but-no-op `watch --transcript` (speaker-labeled `data.transcript`;
derived per run, never persisted, excluded from the cache key) and
`--content` (full describe markdown as `data.content`; served on cache hits),
and **removes `watch --json-index`** (breaking: now an unknown-flag error).
Because the speech fix is load-bearing, the skill floor was raised to 0.3.12
(`min_version`/preflight, the 0.3.7 floor-raise pattern — the dist PR merges
only after CDN `channels.stable` = 0.3.12). 0.3.13 is a docs/prompt parity
release for **sites embed v7 playback speeds**: every `<cg-video>` gets a
playback-speed menu at every player size (default rates `1 1.5 2`), authors
override the list with the space-separated `playbackrates` attribute, and the
JS API gains a `playbackRate` get/set (settable before mount; non-positive/
non-numeric ignored). The speed menu lives in the Cloudglue-served embed
script, not the binary — no new verbs, flags, or feature ids (verbs stay 16,
features stay 33), the skill floor stays 0.3.12, and already-published sites
pick it up without republishing; the binary's embed guidance (skill reference,
kitchen sink, system prompt, publish notes) moved from v6 to v7 wording.
0.3.14 adds **opt-in Open Graph link previews** (SDK bumped to 0.7.20; feature
`publish.link.preview.v1`, features 33→34, verbs stay 16): `publish` and
`publish video` take `--link-preview none|full`, and site publish also takes
`--preview-title` / `--preview-image` (validated as an absolute http(s) url
before any upload). Public sites/shares always unfurl — a public site's card
comes from the `og:*` tags in the author's own HTML, which is why the embed
docs now tell generators to emit them on every public publish. Private sites
and shares are redirected to sign-in before an unfurl bot sees anything, so
`full` opts them into a metadata-only stub; that makes the card fields
publicly readable (content, video, tokens, and cookies never leak, and
playback stays sign-in gated), so every doc surface says to ask the user
first. Flipping the setting on an existing site is a settings PATCH with no
re-upload, reported as the new `settings-only` publish action. Because the
skill teaches the flags, the floor was raised to 0.3.14 (the 0.3.12
floor-raise pattern — the dist PR merges only after CDN `channels.stable` =
0.3.14). 0.3.15 picks up SDK 0.7.21 (spec v0.7.11) — **Iconik connector,
metadata collections, and source-metadata search** (features 34→38, verbs
stay 16): Iconik becomes the seventh metadata-bearing provider
(`iconik://asset/<id>` URIs on `connectors sync`/`inspect`, `--from/--to` on
asset date_created and `--title-search` on `connectors files`, custom
metadata-view fields under `source_metadata.iconik_metadata.<Field>`;
feature `library.connectors.iconik.v1`); `library collections create --type
metadata` makes a metadata collection that indexes connector source_metadata
+ user metadata (new `collections add --metadata '<json|file.json>'`) into
file-level search documents WITHOUT processing media — free to index, no
processing configs (create rejects `--prompt`/`--schema`), queried via
`probe --scope file`/`ask` (feature `library.collections.metadata.v1`);
`probe --filter "<path[op]value>"` (repeatable, ANDed, collection scopes
only; ops `=` `!=` `>` `<` `~=` LIKE `*=` contains-any `&=` contains-all
`^=` in; path prefixes route to source_metadata/metadata/video_info/file
buckets, `video_info.*`/`file.*` stripped to the bare field the schema
enums) filters before semantic
ranking (feature `probe.filters.v1`); and `library connectors refresh
<file-id|uri>` re-fetches an existing file's source_metadata from its
connector and re-indexes its metadata collections — free (feature
`library.connectors.refresh.v1`; refresh takes a SOURCE, unlike
inspect/sync which take `[connector-id] <uri>`). Because the skill teaches
the new flags/subcommands, the floor was raised to 0.3.15 (same
merge-after-CDN gate). 0.3.16 is an envelope-truth and collections release
(features 38→40, verbs stay 16), fixing the failure modes a live agent
session surfaced: `watch`'s `data.segmentation` now reports the segmentation
that actually produced `segments[]` (shots/chapters runs were mislabeled
`uniform:20`, manufacturing a phantom "silent fallback" — the synthesized
speech-only label is unchanged), a shots run over cut-less footage that
max-caps every window gets an explanatory `data.segmentation_note`, and
per-verb `--help` names every shared flag per group (`[cache: --refresh
--no-cache …]`) instead of the "[common output/cache/source options]"
placeholder that hid the cache flags from grepping agents. `library
collections create` gains `--describe full|speech|light|<comma-list>`
(feature `library.collections.describe.v1`; media-descriptions only) because
the Cloudglue API default indexes speech+summary ONLY and the choice is
immutable post-create — `collections show` now surfaces `describe_config`,
and the create summary names the indexed modalities. Collections listings
switch to the API's real offset pagination (feature
`library.collections.pagination.v1`): `show` returns `data.total` plus a
working `has_more`/`next_page_token` (numeric offset cursors accepted via
`--page-token`), pagination cursors are exempt from the `_token` secret
redaction that shipped the literal `[redacted]` where the cursor belonged,
and `collections sync` mirrors no longer silently truncate at 100 files
(pre-0.3.16, every listing was the first 50 rows with `has_more: false`).
Because the skill teaches `--describe` and show pagination, the floor was
raised to 0.3.16 (same merge-after-CDN gate). 0.3.17 picks up SDK 0.7.23 and
adds the **`query` verb — analytical structured queries** over collection
data via Cloudglue `/v1/query` (verbs 16→17, features 40→42: `query.v1` +
`query.export.v1`): a single read-only SQL SELECT, or a natural-language
question compiled to SQL server-side (the compiled statement returns in
`data.sql`; an uncompilable question errors instead of guessing), runs over
three per-request virtual tables — `files` (one row per file+collection,
with `metadata`/`source_metadata` JSON columns), `entities`, and
`segment_entities` (each file's MOST RECENT completed extraction only) —
so where `probe`/`ask` find content semantically, `query` counts, groups,
and joins it. Surface: positional question or `--sql` (exactly one),
repeatable `--in` collection scopes (up to 20), `--dry-run`
(validate/compile + output columns, no execution, reduced cost),
`--max-rows` (default 1000, max 10000; `data.truncated` on cap), `--export
csv|jsonl` (server-side background export → gzipped download to `-o` /
`tinycloud-output/exports/`; `--background` returns `pending` with a `query
show` next-hint), and free subcommands `schema` (virtual tables + each
collection's extracted fields/extract_schema — the taught always-first
step) / `list` / `show <id>` (`-o` downloads a completed export while its
24h link lives) / `cancel <id>` (aborts an in-flight export and refunds).
Sync SQL bills 2 credits, NL 4, dry-run 1–2, exports reserve 4 (+1/100MB);
schema/list/show/cancel are free, and failed runs auto-refund. `query` is
also a workflow step node and an agent tool (it joins the LLM tool set,
unlike `login`). Because the skill teaches the verb, the floor was raised
to 0.3.17 (same merge-after-CDN gate — the dist PR merges only after CDN
`channels.stable` = 0.3.17). 0.3.18 is a **sites-embed v8–v12 parity and
publish-guard release** (no new verbs, flags, or feature ids — verbs stay 17,
features stay 42; the embed features ship in the Cloudglue-served script, so
already-published sites pick them up without republishing): the embed family
the binary teaches moved from v7 to v12 — v8 splits delivery into a core
script plus a lazily-loaded live chunk (`/__cg/embed-live.js`; no
author-facing change, `/__cg/embed.js` stays the only script tag and
generators must never add the chunk themselves), v9 opens up the live
elements (`<cg-chat>` gains `instructions` — a per-site system prompt — and a
Stop button; `<cg-search>` gains `scope`/`modalities`/`label-filters`/
`threshold`/`limit`/`group-by="file"`/`sort-by`; `<cg-deep-search>` streams
its synthesis and takes `exclude-weak-results`; `<cg-face-search>` takes
`threshold`/`limit` and plays hits as short bounded moments; the JS client's
`search`/`faceSearch` accept the full v1 `filter` object), v10 makes every
live panel restylable via `::part()` and emits host events (`cg-results` /
`cg-answer` / `cg-error`, plus cancelable `cg-resultopen`/`cg-citationopen`
to override how moments open), v11 adds `<cg-query>` +
`window.cloudglue.query` (natural-language analytical questions → inline
table + the compiled SQL — the site-side face of the same engine as the
`query` verb; point it at an entities/metadata collection), and v12 adds
`<cg-transcript>` + `window.cloudglue.transcript` (click-to-seek speech
turns that follow a bound player; unbilled) and `<cg-chapters auto>`
self-population. The binary-side change: the publish public-site guard now
also rejects `<cg-query>`, `<cg-transcript>`, and `<cg-chapters auto>` (the
`auto` attribute makes the otherwise public-safe chapters element
private-only; explicit-children `<cg-chapters>` stays public-safe). Because
the skill teaches the new elements and relies on that extended guard, the
floor was raised to 0.3.18 (same merge-after-CDN gate — the dist PR merges
only after CDN `channels.stable` = 0.3.18). 0.3.19 is a **host-agent
reliability release — the silent-stop fix** (no new verbs, flags, or feature
ids — verbs stay 17, features stay 42; the changes live in the interactive
agent and headless `-p`, not the video-verb surface the skill drives, so the
skill floor stays 0.3.18 — the 0.3.13 no-raise pattern): adaptive-thinking
chat models stream a thinking block that spends from the same per-response
`max_tokens` budget as text and tool calls, so a long think could exhaust the
old 8192-token cap, return `stop_reason: max_tokens` with no error, and the
agent silently yielded mid-task with only a duration line (typing `continue`
resumed it). Now a `length`-stopped turn — and an empty `stop`-ended one,
e.g. a dropped stream read as a clean end — surfaces a status line instead of
a quiet handoff; the cap rises to 32000, tunable via
`TINYCLOUD_MODEL_MAX_TOKENS`; a guard blocks the final tool call of a
`length`-stopped message with an error result (truncated tool-call JSON gets
repaired into valid-but-incomplete args, e.g. a write with half a file) so
the model re-issues it in smaller pieces, wired in both the interactive
agent and headless `-p`; a truncated turn auto-continues via a hidden
prompt, bounded to 2 consecutive per user turn, disabled with
`TINYCLOUD_AUTO_CONTINUE=0` or `preferences.autoContinue: false`; streamed
thinking shows a "Reasoning" loader label; and headless `-p --json` traces
gain an additive `stop_reason` field plus a stderr warning on truncation.
Headless `-p` also reaches parity with the interactive agent on model
failures: it gains the 0.3.7 chat-retry layer (`TINYCLOUD_MODEL_RETRIES` now
covers both agents), and an errored turn is truthful — `✖ turn failed` on
stderr, an `error` field in the `--json` trace, exit 1 (previously a
backend blip could exit 0 with an empty, zero-usage trace).
0.3.20 picks up SDK 0.7.24 and adds **playable Slack unfurls and entity
search** (features 42→45, verbs stay 17): `--link-preview` on `publish` and
`publish video` gains a `player` level (feature
`publish.link.preview.player.v1`) — the pasted link unfurls in Slack with an
INLINE PLAYER via the Cloudglue Slack app instead of a static card. On a
private share, `player` makes the share itself play; a site plays its hero
share, set with the new site-only `--preview-share <share-id>` flag (requires
`--link-preview player`; `""` clears; without a hero the unfurl stays
card-only). Unlike `full`, `player` matters on BOTH site visibilities — a
public site's hero must be a public share, and public *shares* already unfurl
playable with no flag. Private content plays only in Slack workspaces the
account owner connected in the Cloudglue dashboard; `player` implies the
`full` card, anyone who can see the Slack message can play the video (every
doc surface says ask the user first), and downgrading revokes playback in
already-posted unfurls. The card-field flags now accept `full` or `player`;
the hero comes back as `data.preview_share_id` and in `publish list` rows as
`link-preview=player hero=<id>`. Entity search (features `probe.entities.v1`
/ `probe.scope.auto.v1`): an `entities` collection is a first-class
`probe`/`ask` target — each file's latest completed extraction is indexed
into search documents for free; video-level extractions search at `--scope
file`, segment-level at `--scope segment` (tinycloud-created entities
collections are segment-level by default), and omitting `--scope` is now AUTO
(the search picks the level per scope, so probing no longer requires knowing
the collection type — previously an omitted scope meant segment-only).
`collections show` file rows gain `searchable_status` (the metadata/entity
search-index readiness signal, distinct from the enrichment `status`), and
the SDK bump also makes `publish video list`'s file filter bind server-side
(the SDK previously sent camelCase query keys the API ignored; tinycloud's
client-side filter masked it). Because the skill teaches the new
flag values and probe semantics, the floor was raised to 0.3.20 (same
merge-after-CDN gate — the dist PR merges only after CDN `channels.stable` =
0.3.20).
0.3.21 picks up SDK 0.7.25 (spec v0.7.17) and adds **bulk connector metadata
imports** (features 45→46: `library.collections.imports.v1`; verbs stay 17 —
`imports` is a `library` subcommand family, not a verb): `library imports
create <col> --name <n> --connector <id>` saves an immutable definition that
lists a data connector server-side (google-drive, dropbox, zoom, gong,
recall, grain, iconik — not S3/GCS) and imports each matching file's
source_metadata into a METADATA collection as collection files — thousands
to hundreds of thousands of records per run, no media processing, runs
consume no credits. Filters are listing passes reusing the `connectors
files` flags (or `--filters '<json-array>'` for several passes — Dropbox
listing is non-recursive, one pass per folder; unsupported keys are a 400
at create, never dropped; Zoom/Gong pin their 6-month lookback into the
stored filters at create; iconik caps 10k rows per set). Modes: `append`
(default) imports new files + retries failures; `refresh` re-imports
everything matched and alone honors `--delete-missing` (sweeps ONLY files
this import brought in; a `--max-files`-capped run never sweeps).
`--rate-limit` (clamped per connector) and `--thumbnails` (Grain/iconik
posters) tune runs; `--no-start` saves without running. `imports
list`/`show` page run history; `create`/`run`/`show` report envelope status
`pending` while a run executes (with an `imports show` next-hint, mirroring
`query --background`) and `ready` once settled; one run may be active per
collection (busy trigger = rewritten retryable 409 error); `cancel`
(defaults to the latest run) and `delete` never remove imported files.
Because the skill teaches the subcommand family, the floor was raised to
0.3.21 (same merge-after-CDN gate — the dist PR merges only after CDN
`channels.stable` = 0.3.21).
0.3.22 picks up SDK 0.7.28 (spec v0.7.21) and turns bulk imports into a
**general collection loader** (features 46→49, verbs stay 17): the SDK's
`metadataImports` namespace is renamed `bulkImports` (the old name stays as
a back-compat alias, and tinycloud's adapter prefers the new one and falls
back), and an import's `import_type` — inferred from the TARGET
COLLECTION's type at create and fixed for the import's life — decides what
a run ingests. A **metadata** collection still imports source_metadata only
(free, no media processing); **any other** collection type
(media-descriptions, entities, rich-transcripts, face-analysis) now imports
the **media itself**, each file ingested and processed exactly like
`collections add`, so it is **billed per file** and counts against the
account's file usage limits (feature
`library.collections.imports.media.v1`). Media runs are additionally capped
at 10000 files per run whatever `--max-files` says, a run that exhausts
credits or a usage limit stops and keeps everything already imported (rerun
`append` to resume), and `refresh` on a media import re-syncs source
metadata only — media bytes are never re-downloaded. Because the cost story
now depends on the target collection, every summary names the kind
("Created media import …") and a media create/run carries an explicit
per-file billing warning, `imports list`/`show` render `type=media`, and
run progress gains the `files_imported` counter. `--thumbnails` and the new
`--enrich-metadata` are **metadata-import only** (either on a media import
is a clean upstream 400): `--enrich-metadata` (feature
`library.collections.imports.enrich.v1`, off by default) backfills
source-metadata fields the connector's listing omits after each index batch
settles — Gong parties + Call Spotlight content (batched and re-embedded,
so the content becomes searchable) and Dropbox `media_info`
duration/dimensions — reported by the new `files_enriched` counter, a no-op
for other connectors, and costing upstream API budget plus (for Gong)
embedding work. Dropbox listings gain `--recursive` on `connectors files`
and as a `recursive` filter-set key on `imports create` (feature
`library.connectors.recursive.v1`), walking the whole subtree under
`--path` instead of its direct children — so a Dropbox tree is one
recursive pass rather than one pass per folder; on the wire it is the
STRING `"true"`/`"false"`, and tinycloud rejects any other spelling
client-side. Because the skill teaches the media-import cost model and the
new flags, the floor was raised to 0.3.22 (same merge-after-CDN gate — the
dist PR merges only after CDN `channels.stable` = 0.3.22).
0.3.23 picks up SDK 0.7.29 (spec v0.7.23) and adds **Find Moments** — the
first new verb since `query` (verbs 17→18, features 49→52: `moments.v1`,
`moments.collections.v1`, `moments.search.v1`). Where `probe`/`ask` FIND
content semantically and `extract` pulls declared fields, `moments` sweeps a
WHOLE video against a rubric the caller wrote and persists every window that
qualifies. `tinycloud moments <source> --name <criterion> --instructions
"<rubric>"` runs one criterion over one video; `--criterion '<json|file>'`
takes the full rubric (`moment_schema` typed fields, `finding_schema`,
`anchors`, one `scoring` key that populates each moment's `criterion_score`).
The criterion is snapshotted and hashed onto the run (`criterion_hash`), so
editing a rubric yields a different run rather than reinterpreting an old one;
runs reuse a compatible describe or create one (`--describe-job` pins), and
`--boundary` (sentence default), `--signals` (speech default), `--speakers`
and duration bounds tune acceptance. Criterion NAMES are lowercase snake_case
(`^[a-z][a-z0-9_]*$`, max 64) and tinycloud rejects anything else
client-side — the API answers a bad name with a bare "Field(s) in the request
are invalid" naming no field. `moments show|list|delete` manage run history
(deleting an in-flight run refunds it; a completed one does not), and
**`--limit`/`--min-score`/`--sort` are READ-TIME shaping, not selection**:
every accepted moment stays persisted and `data.run.total_moments` always
reports the full accepted count. Findings (`absence` | `observation`) are the
non-temporal counterpart. `library collections create --type moments` makes a
standing collection whose criteria run over every current AND future member —
at least one criterion is REQUIRED at create (the type alone is a 400), and
each entry is a criterion ATTACHMENT (the rubric wrapped in its run options),
not a bare rubric. `library moments attach|detach|list|findings` manage and
enumerate it: attaching is free while the per-file backfill runs bill as they
execute, `--sort criterion-score|rank` requires `--criterion <name>` (scores
compare only within one rubric), and detaching — or removing a file — drops
moments from COLLECTION ENUMERATION only, leaving the runs as job history.
`moments search` runs `/search` with `scope: "moment"` (the endpoint face
search uses); it is deliberately NOT `probe --scope moment`, because probe
runs on deep search whose scope levels are only file and segment. As of spec
v0.7.23 `query` has no moments virtual tables and `ask`/responses have no
moment awareness. Because the skill teaches the verb, the floor was raised to
0.3.23 (same merge-after-CDN gate — the dist PR merges only after CDN
`channels.stable` = 0.3.23).
The host-level `profile` verb and the leading global flags `--home`/`--profile`
(also `$TINYCLOUD_HOME`; 0.3.3+) relocate state and are intentionally absent
from `commands --json` — like the launcher's install/update, they're CLI/host
concerns, not video operations.

**Pre-0.3.0 binaries open an interactive TUI on `--version --json`** instead
of printing JSON. Any script invoking the binary must redirect `</dev/null`
(and ideally bound with a timeout — see `run_with_timeout` in
`scripts/smoke-test.sh`) or it will hang on old installs.

### Skills

- The npm package bundles `skills/` (see `files` in package.json);
  `npx @cloudglue/tinycloud skills install` (`lib/skills.js`) copies them
  into harness dirs without touching the binary cache. The four known
  harnesses live in the `HARNESSES` table, each at `<configDir>/skills`:
  `claude-code`→`.claude`, `agents`→`.agents` (universal agentskills.io
  layout), `codex`→`.codex`, `cursor`→`.cursor`. In a TTY with no explicit
  target it shows an interactive menu (detected dirs preselected, via
  `promptForTargets`); non-interactive/`--yes` runs use `resolveTargets`,
  which installs into every detected dir (default `.claude` when none).
  `--harness <ids>` selects explicitly; `--global` is Claude-only
  (`~/.claude/skills`); `--dir`/`--skill` also override. `resolveTargets`
  stays pure (no prompting) so it's unit-testable.
- `skills/tinycloud/` is the flagship: SKILL.md + `reference/*.md`
  (progressive disclosure) + `scripts/preflight.sh` + `tinycloud-skill.json`
  (compat manifest: `min_version`, `supported_range`, `required_features`).
  `skills/tinycloud-init/` is the guided first-time setup.
- `preflight.sh` prints exactly ONE actionable line; exit codes: 0 ok /
  10 binary missing / 11 version too low / 12 missing features /
  13 missing credentials. Its `REQUIRED_FEATURES` list must stay identical to
  `tinycloud-skill.json` — CI diffs them.
- The 5 workflow skills (sales-coaching, blog-post, ad-analysis,
  meeting-breakdown, youtube-publish) are thin wrappers over recipes bundled
  *inside the binary* (`tinycloud workflow <name> <source> --allow-command --json`);
  they ship no yaml/scripts. `tinycloud-skill-creator` wraps the binary's
  bundled scaffolder.
- **Selective-install invariant** (verified against `npx skills add`): the
  skill *directory* is the unit of distribution — installing one skill copies
  only that folder. A skill may only reference files inside its own folder;
  any cross-skill mention must be conditional prose ("if the `tinycloud`
  skill is installed…") with an inline fallback, never a relative path link.
- Billing wording: cloud verbs "run through the configured Cloudglue API key"
  (rate card: https://app.cloudglue.dev/home/billing/rate-card) — avoid
  "costs money" phrasing.

### CI (.github/workflows/)

- `ci.yml`: PR-gating jobs (wrapper unit/e2e, shellcheck, plugin/skill
  metadata sync) vs live-CDN jobs (`Install + smoke` matrix, npx-against-CDN)
  which run only on push to main or manual dispatch — never on PRs, because a
  CDN gap would fail every PR.
- The live CDN serves 0.3.23 (latest aliases + v-prefixed pinned tarballs
  for 0.3.0 through 0.3.23, with `manifest.json` + `.sha256`
  sidecars; `channels.stable` = 0.3.23); all smoke legs are required.
- `ci.yml` also pins every version field to `package.json`: plugin.json,
  marketplace.json (metadata + each plugin entry), and tinycloud-skill.json's
  `skill_version`. The plugin metadata had silently drifted to 0.3.19 through
  two releases before that check existed.
- `publish-npm.yml` (tag `v*`): asserts tag == package.json version → gates
  on `generate-manifest.mjs --check` against the live CDN → publishes via
  npm trusted publishing (OIDC, `id-token: write`, npm ≥ 11.5.1 — no token
  secret; provenance is automatic). The trusted-publisher connection is
  configured on the npm package settings page (workflow `publish-npm.yml`).

## Verifying changes

For skill/doc changes, ground claims in a real binary: extract a dist tarball
(`tar -xzf tinycloud-darwin-arm64.tar.gz -C /tmp/tinycloud-test`) and check
`--version --json`, `commands --json`, and `workflow validate <recipe> --json`
against what the docs say. Skill behavior can be tested headlessly:
`cd <project> && claude -p "<task using the skill>" --allowedTools "Bash,Read,Glob,Grep,Skill"`
with the skills copied into `<project>/.claude/skills/`.
