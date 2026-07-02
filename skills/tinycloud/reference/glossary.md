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

## Media and identity

- **Cloudglue file** — a video uploaded to (or registered with) Cloudglue,
  identified by a file id and addressable as `cloudglue://files/<id>`. The
  first cloud operation on a local video uploads it once; later operations
  reuse the file.
- **Collection** — a named group of Cloudglue files (id `col_…`), e.g. "all
  sales calls". Verbs scope to one with `--in collection:col_…`. Collection
  ids are stable; display names are not. A collection has a type that decides
  which verb reads it: `media-descriptions` (default) backs `ask`/`probe`/`search`,
  `face-analysis` backs `face list`/`face search`, and `entities` (created with
  `--prompt`/`--schema`) backs `library collections entities` (`rich-transcripts`
  also exists). Manage them with `library collections create|add|remove|delete`
  (0.3.4+); every type follows `create → add → poll show → query → delete`. `add`
  enriches each file asynchronously and returns `pending` — poll
  `library collections show <col>` until every `files[].status` is `completed`
  before querying.
- **Data connector** — a linked external source of recordings (Zoom, Grain,
  Google Drive, Dropbox, Loom, S3/GCS). `tinycloud library connectors …`
  lists, browses (`files`, with provider-specific filters), and syncs
  individual items by URI (e.g. `grain://recording/<id>`) so they become
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
  produces (summary, segments, transcript-ish context). Cached locally and
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
  `accent-color`, `exclusive`, and `clip-start`/`clip-end` to frame a single
  "back to moment" clip — `clip-only`, 0.3.8+, plays nothing but that
  window) and a JS API (`playSegment`, `seekTo`, media
  events re-dispatched on the element) for custom site HTML, and plays
  standalone or inside the container components (`<cg-playlist>`,
  `<cg-grid>`, `<cg-chapters>`) — see reference/verbs.md.
- **Discovery components (live API, 0.3.6+)** — the same embed script also
  defines four collection-scoped, **private-site-only** elements that let a
  viewer search or chat inside a published site and play results inline via
  `<cg-video>`: `<cg-chat>`, `<cg-search>`, `<cg-deep-search>` (over a
  media-descriptions / rich-transcripts collection) and `<cg-face-search>` (over
  a face-analysis collection). They carry no share id, but `tinycloud publish`
  rejects them on a public site — publish `--visibility private`. See
  reference/verbs.md.

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
