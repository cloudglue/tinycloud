# Verbs: commands, flags, and cost classes

`tinycloud commands --json` is the machine-readable source of truth — name,
aliases, summary, cost class, auth requirement, flags, and subcommands for
every verb. Regenerate doubts from it instead of trusting prose.

| Verb | Cost | Auth | Use |
|---|---|---|---|
| `watch` | cloud | yes | Analyze a video → reusable context + Cloudglue-ready ref |
| `extract` | cloud | yes | Pull structured facts, entities, or moments |
| `caption` | varies | no | Subtitles and transcripts (SRT/VTT/ASS) |
| `search` | local | no | Local keyword search over cached context |
| `probe` | cloud | yes | Semantic moment/video search over a Cloudglue-ready scope |
| `ask` | cloud | yes | Grounded Q&A over one or more videos |
| `clip` | local | no | Cuts, thumbs, audio, stitch, split, transcode, burn, explore |
| `grab` | network | no | Download a remote video (YouTube, TikTok, Loom, direct) |
| `library` | varies | no | Collections, connectors, local mirrors, sync |
| `jobs` | network | yes | Poll/wait/forget tracked async jobs |
| `workflow` | varies | no | Validate/plan/run workflow recipes |
| `publish` | cloud | yes | Publish HTML/code artifacts as Cloudglue Sites |
| `setup` | local | no | Credentials and service connections |

Cloud verbs spend Cloudglue credits. `caption`/`library`/`workflow` vary by
what they end up doing.

## Per-verb flags

Flags shared by most verbs are listed once at the bottom.

### watch — analyze a video

```bash
tinycloud watch <source> [--segment uniform:20|chapters|shots|segments]
  [--profile default|light|custom] [--speech-only | --visual-only]
  [--start <t>] [--end <t>] [--transcript] [--content] [--json-index]
  [--background]
```

### extract — structured facts

```bash
tinycloud extract "<query>" <source> --json          # free-form query
tinycloud extract --schema ./schema.json <source>    # JSON-schema-shaped output
  [--segment-level] [--segmentation chapters|shots|segments]
  [--include-thumbnails] [--transcript-mode] [--background]
```

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

### library — collections and connectors

```bash
tinycloud library collections list --json
tinycloud library collections show <col_id> --json
tinycloud library collections sync <col_id> --artifacts descriptions,transcripts,thumbnails,metadata --json
tinycloud library connectors list --json
tinycloud library connectors files <connector-id> [--limit 25] [--page-token <t>] --json
tinycloud library connectors sync <connector-id> <uri> --json   # e.g. grain://recording/<id>
```

Collection IDs (`col_…`) are stable; collection names are display-only.

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
```

`public` = anyone with the link; `private` = Cloudglue account members only
(same URL, edge-gated). Default keeps the site's current visibility.
Republishing identical content makes no network calls; flipping visibility
patches without re-uploading.

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

Cache/spend: `--refresh` (recompute), `--no-cache` (no persistence),
`--cached` (reuse exact-match ask/probe history), `--no-upload` (refuse cloud
upload → `needs_upload`), `--no-download` (refuse local materialization →
`needs_download`).

Source reuse: `--source-id <id>`, `--result-id <id>`.
