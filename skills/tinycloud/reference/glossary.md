# Glossary: tinycloud and Cloudglue terms

Quick definitions for terms that appear in tinycloud output, flags, and these
docs. Use this when the user asks "what is a Cloudglue file / collection /
connector?" or an envelope field needs explaining.

## Platform

- **Cloudglue** — the video-understanding API platform that powers
  tinycloud's cloud verbs (analysis, extraction, semantic search, Q&A,
  publishing). Account, API keys, and billing live at
  [app.cloudglue.dev](https://app.cloudglue.dev); usage is billed per the
  [rate card](https://app.cloudglue.dev/home/billing/rate-card).
- **tinycloud** — the agent CLI distributed from this repo
  (https://tinycloud.sh). Local verbs (`clip`, `search`, `setup`) run on your
  machine; cloud verbs call Cloudglue with your API key.
- **Browser sign-in / device login (0.3.10+)** — `tinycloud login` runs an
  OAuth-style device-authorization flow: it prints a short code + verification
  URL, opens the Cloudglue dashboard, and on approval mints a normal `cg-` API
  key saved to config exactly like a pasted key (the raw key is never printed).
  The interactive counterpart of `setup cloudglue --api-key`; paste-key and
  `$CLOUDGLUE_API_KEY` remain fully supported for headless/scripted setup.

## Media and identity

- **Cloudglue file** — a video uploaded to (or registered with) Cloudglue,
  identified by a file id and addressable as `cloudglue://files/<id>`. The
  first cloud operation on a local video uploads it once; later operations
  reuse the file.
- **Collection** — a named group of Cloudglue files (id `col_…`), e.g. "all
  sales calls". Verbs scope to one with `--in collection:col_…`. Collection
  ids are stable; display names are not. A collection has a type that decides
  which verb reads it: `media-descriptions` (default) backs `ask`/`probe`/`search`,
  `face-analysis` backs `face list`/`face search`, `entities` (created with
  `--prompt`/`--schema`) backs `library collections entities`, and `metadata`
  (0.3.15+) backs `probe --scope file`/`ask` (`rich-transcripts`
  also exists). Manage them with `library collections create|add|remove|delete`
  (0.3.4+); every type follows `create → add → poll show → query → delete`. `add`
  enriches each file asynchronously and returns `pending` — poll
  `library collections show <col>` until every `files[].status` is `completed`
  before querying.
- **Metadata collection (0.3.15+)** — a `--type metadata` collection that
  indexes connector `source_metadata` plus user metadata (`collections add
  --metadata '<json>'`) into file-level search documents WITHOUT downloading
  or processing the media — free to index, no processing configs. Query with
  `probe --scope file` (optionally `--filter` on `source_metadata.*` /
  `metadata.*` paths) or `ask`; feature id `library.collections.metadata.v1`.
- **Structured query (0.3.17+)** — an analytical read-only SQL `SELECT` (or a
  natural-language question compiled to SQL server-side) run by `tinycloud
  query` over a collection's structured data; features `query.v1` /
  `query.export.v1`. Complements semantic search: `probe`/`ask` FIND
  content, `query` MEASURES it (counts, group-bys, joins). Runs are stored
  (`query list`/`show`) and large results export to gzipped CSV/JSONL.
- **Virtual tables** — the three per-request tables a structured query sees:
  `files` (one row per file+collection: attributes plus `metadata` and
  `source_metadata` JSON columns), `entities` (file-level extracted fields),
  and `segment_entities` (segment-level entities with timestamps). Built from
  each file's most recent completed extraction; discover the exact columns
  and extracted fields with `tinycloud query schema --in collection:col_…`.
- **Source metadata** — the provider-supplied fields a connector attaches to
  a synced file (`source_metadata`: title, participants, dates, tags, AI
  summary; Iconik adds `iconik_metadata.<Field>` custom fields). Peek it
  without creating a file (`connectors inspect`), re-fetch it for an existing
  file (`connectors refresh`, 0.3.15+ — also re-indexes metadata
  collections), and filter searches on it (`probe --filter
  "source_metadata.…"`, 0.3.15+).
- **Data connector** — a linked external source of recordings (Zoom, Grain,
  Gong, Recall, Google Drive, Dropbox, Iconik (0.3.15+), S3/GCS).
  `tinycloud library connectors …`
  lists, browses (`files`, with provider-specific filters; rows carry provider
  metadata on 0.3.11+), peeks one item's provider metadata without syncing
  (`inspect`, 0.3.11+), re-fetches an existing file's stored metadata
  (`refresh`, 0.3.15+), and syncs individual items by URI
  (e.g. `grain://recording/<id>`, `iconik://asset/<id>`) so they become
  Cloudglue files.
- **Source** — anything a verb accepts as input: a local path, URL,
  `cloudglue://files/<id>` URI, connector URI, collection, or a bare file-id
  UUID (normalized to `cloudglue://files/<id>`; an existing local path of the
  same name wins).
- **Supported inputs** — local uploads (`watch`, `see`, `extract`, `face`,
  `library collections add`) map by extension: video `.mp4 .mov .webm .mkv .m4v`,
  audio `.mp3 .wav .m4a`, and (for `see`/`extract` only, 0.3.7+) image
  `.jpg .jpeg .png .webp`. Other extensions upload as `application/octet-stream`
  and may be rejected upstream — transcode to a mapped container first
  (`clip transcode`); unsupported image types (HEIC/GIF/BMP) are rejected before
  upload with a "transcode to JPEG, PNG, or WebP" hint. Local uploads are bounded
  by Cloudglue at ~3 GB and 2 s–3 h (connector ingests allow more); a public
  `http(s)` image URL is analyzed in place with no upload. `face match`/`face
  search` query images must be **JPEG or PNG**. Images can't be added to
  collections. Use `grab` for YouTube and `library connectors sync` for share
  links rather than passing those URLs to upload verbs.
- **`ref` / `source_id` / `result_id`** — stable identifiers in every
  envelope. `ref` is a reusable pointer to the analyzed source (including
  `cloud_ready` and the Cloudglue file id) that pipes between verbs;
  `--source-id`/`--result-id` flags reuse prior work explicitly.

## Operations

- **Envelope** — the JSON object every command prints on stdout
  (`status`, `data`, `ref`, `meta`, `error`, …). The machine contract; see
  reference/envelope.md.
- **Watch context / describe** — the reusable analysis `tinycloud watch`
  produces (summary, segments with their spoken utterances inlined as
  `speech[]`, transcript-ish context). Cached locally and
  mirrored in Cloudglue, so later `extract`/`ask`/`search` reuse it instead
  of re-analyzing.
- **See / image describe (0.3.7+)** — the image counterpart of `watch`:
  `tinycloud see <image>` produces file-level image context (title,
  description, on-screen text) and a reusable `ref`, with no segmentation or
  shots. JPEG/PNG/WebP only; `extract` accepts the same image sources for
  structured pulls.
- **Segmentation** — how a video is split for analysis: `chapters`
  (semantic), `shots` (visual cuts; bounds tunable via
  `--shot-min-seconds`/`--shot-max-seconds`, sub-second min allowed),
  `uniform:<seconds>` (fixed windows).
- **Cache layers** — `meta.cache` reports `identity` (is this the same file
  we've seen?) and `enrichment` (analysis results) as
  `hit | miss | written | skipped`.
- **Job** — a tracked async cloud operation (from `--background`), with
  `meta.job_id`; managed via `tinycloud jobs list|poll|wait|forget`.

## Workflows and outputs

- **Workflow / recipe** — a YAML DAG of verb steps run by
  `tinycloud workflow <name|path>`. Built-in recipes (sales-coaching,
  blog-post, …) ship inside the binary.
- **Run directory** — where a workflow writes everything:
  `./tinycloud-output/runs/<run_id>/`. Single-verb outputs default under
  `./tinycloud-output/`.
- **Artifacts / outputs** — the workflow envelope's `data.artifacts[]`
  (produced files with paths) and `data.outputs{}` (named results, e.g.
  `outputs.html`).
- **Command step** — a workflow step that runs a local script (e.g. an HTML
  renderer); gated by `--allow-command` / recipe `permissions: [command]`.
- **Cloudglue Sites** — hosted pages for published artifacts:
  `tinycloud publish <html> --visibility public|private` returns the stable
  site URL (`{name}.cloudglue.site`) as `url` — the share link — plus a
  `version_url` permalink to that exact version (live immediately; the site
  URL can take up to a minute to serve fresh content). Private = Cloudglue
  account members only, same URL. Manage with `publish list` (rows show
  `published` / `site_version_id`) and
  `publish unpublish <site-id | site-name | label>`.
- **Video share (shareable asset)** — `tinycloud publish video <source>`
  wraps a Cloudglue file in a hosted share page (`data.share.share_url`) plus
  an HLS stream; one active share per (file, visibility). Adding
  `--clip-start`/`--clip-end` (seconds, 0.3.5+) also returns `data.moment_url`,
  the share page bounded to that "back to moment" window (also reachable as
  `?s=<start>&e=<end>` on a `share_url`); adding `--clip-only` (0.3.8+,
  feature `publish.video.moment.hard.v1`) upgrades it to a hard clip —
  `&clip=hard`, the page plays only the moment. Private shares
  embed via the `data.embed_snippet` `<cg-video>` tag, which only plays on a
  private published site of the same account. The embed has playback
  attributes (`autoplay`+`muted`, `loop`, `start-time`, `poster`,
  `accent-color`, `exclusive`, `playbackrates` — space-separated
  playback-speed-menu rates, default `1 1.5 2`, shown at every player size
  (sites embed v7) — and `clip-start`/`clip-end` to frame a single
  "back to moment" clip — `clip-only`, 0.3.8+, plays nothing but that
  window) and a JS API (`playSegment`, `seekTo`, `playbackRate` get/set, media
  events re-dispatched on the element) for custom site HTML, and plays
  standalone or inside the container components (`<cg-playlist>`,
  `<cg-grid>`, `<cg-chapters>`) — see reference/verbs.md.
- **Link preview** — the Open Graph card a platform (Slack, iMessage, Notion,
  Discord) renders when someone pastes a site or share link. Public sites and
  shares always preview: a public site's card comes from the `og:*` tags in
  the HTML you generate, a public share's from its title/description/thumbnail.
  Private sites and shares are redirected to sign-in before an unfurl bot sees
  anything, so they render a bare "Sign in" card unless opted in with
  `--link-preview full` (0.3.14+, feature `publish.link.preview.v1`; private
  sites also take `--preview-title` / `--preview-image`). Opting in makes those
  card fields publicly readable — content and playback stay sign-in gated — so
  ask the user first. See reference/verbs.md.
- **Route preview (0.3.24+, `publish.link.preview.routes.v1`)** — a per-page
  override of a site's link preview, so each route of a single-page site
  (`#/clip/intro`, `#/clip/deep-dive`, …) unfurls with its own hero share,
  card fields, and optional clip window instead of the site-level ones.
  Written with `--route-previews '<json|file>'` on `publish` (requires
  `--link-preview player`; site-only). The set is **replaced wholesale** on
  every write, routes are stored **canonically** (the `#/` prefix, query
  string, and surrounding slashes stripped, so `#/clip/intro` and
  `/clip/intro/` are one route), and a route with no entry falls back to the
  site-level preview fields. See reference/verbs.md.
- **Live-API components (0.3.6+; v8–v12 surface taught from 0.3.18)** — the
  same embed script also defines collection-scoped, **private-site-only**
  elements that let a viewer search, chat, query, or read a transcript inside
  a published site and play results inline via `<cg-video>`: `<cg-chat>`
  (optional `instructions` system prompt + Stop), `<cg-search>` (tuning:
  `scope`/`modalities`/`label-filters`/`threshold`/`limit`/`group-by`/
  `sort-by`), `<cg-deep-search>` (streamed synthesis;
  `exclude-weak-results`) — over a media-descriptions / rich-transcripts
  collection — `<cg-face-search>` (over a face-analysis collection),
  `<cg-query>` (analytical questions → inline table + compiled SQL; any
  non-face collection, best on entities/metadata), `<cg-transcript>`
  (click-to-seek speech turns bound to a player; unbilled), and
  `<cg-chapters auto>` (self-populating chapters). All restylable via
  `::part()` with host events (`cg-results`/`cg-answer`/`cg-error`,
  cancelable `cg-resultopen`/`cg-citationopen`); their implementation loads
  lazily from `/__cg/embed-live.js` (automatic — never a second script tag).
  They carry no share id, but `tinycloud publish` rejects them on a public
  site (0.3.18 extends the guard to query/transcript/chapters-auto) —
  publish `--visibility private`. See reference/verbs.md.

## State and isolation (0.3.3+)

- **Home** — the directory holding all tinycloud state for a run: config,
  sessions, cache, jobs, artifacts, and skills. Default `~/.tinycloud`;
  relocate it with `--home <dir>` or `$TINYCLOUD_HOME`.
- **Profile** — a named, fully isolated home, selected with `--profile <name>`
  and managed by `tinycloud profile list|show|create|use|remove`. Lets multiple
  accounts or installs run side by side without cross-contamination. (Distinct
  from `watch --profile`, which selects an analysis profile.)
- **Project scope** — sessions and capabilities keyed to a project (its git
  root). Sessions live under `<home>/projects/<project-key>/sessions`, and a
  project-local `.tinycloud/config.json` can pin tool/skill allowlists and an
  output base — precedence is CLI flags > project config > global config.
