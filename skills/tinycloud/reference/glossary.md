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
  ids are stable; display names are not.
- **Data connector** — a linked external source of recordings (Zoom, Grain,
  Google Drive, Dropbox, Loom, S3/GCS). `tinycloud library connectors …`
  lists, browses (`files`, with provider-specific filters), and syncs
  individual items by URI (e.g. `grain://recording/<id>`) so they become
  Cloudglue files.
- **Source** — anything a verb accepts as input: a local path, URL,
  Cloudglue file id, connector URI, or collection.
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
- **Segmentation** — how a video is split for analysis: `chapters`
  (semantic), `shots` (visual cuts), `uniform:<seconds>` (fixed windows).
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
  `tinycloud publish <html> --visibility public|private` returns a shareable
  URL (private = Cloudglue account members only, same URL). Manage with
  `publish list` and `publish unpublish <site-name>`.
