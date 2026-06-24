# Pipelines: pipes, batching, async jobs, and spend control

## The pipe protocol

Tinycloud verbs compose through JSONL envelopes on stdin/stdout:

```bash
tinycloud watch ./demo.mp4 --json | tinycloud extract "key moments" --json
```

- The downstream verb parses each stdin line as an envelope; `ref` /
  `source_id` flow through, so `extract` knows exactly which analyzed source
  to use without re-uploading.
- A non-`ready` upstream envelope produces a blocked downstream envelope with
  `error.code: "upstream"` instead of running — fix upstream, don't retry
  downstream.
- Raw stdin lines that are file paths also work as batch sources:

```bash
cat sources.txt | tinycloud watch --json
```

- Piping watch envelopes into `search` / `probe` / `ask` auto-scopes them via
  `ref.cloudglue_file_id` / collection ids.

## Multi-video batching

Most verbs accept multiple sources; output is JSONL with one envelope per
source. The process exit code is the worst status seen. Iterate the lines and
branch per envelope.

```bash
tinycloud watch ./a.mp4 ./b.mp4 --json
tinycloud caption ./talks/*.mp4 --format srt -o ./tinycloud-output/captions/ --json
```

## Async jobs

Long cloud operations (`watch`, `extract`) support `--background`:

```bash
tinycloud watch ./long.mp4 --background --json   # → status:"pending", meta.job_id
tinycloud jobs wait <job-id> --timeout 120s --json
tinycloud jobs list --status running --json
tinycloud jobs poll <job-id> --json              # single non-blocking check
tinycloud jobs forget <job-id> --json
```

Never start downstream work while an envelope is `pending`. `ask` does not
support `--background`.

## Spend control

Cloud verbs run through the configured Cloudglue API key (usage per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card)). Patterns to
control spend:

```bash
# Refuse uploads: returns needs_upload instead of spending
tinycloud watch ./new.mp4 --no-upload --json

# Reuse a prior watch's enrichment without re-uploading
tinycloud extract "key moments" ./demo.mp4 --cached --json

# Free local lookup over already-cached context (no cloud call at all)
tinycloud search "pricing" --in ./demo.mp4 --json
```

- `--no-upload` → refuse Cloudglue upload/materialization (`needs_upload`).
- `--no-download` → refuse local materialization (`needs_download`).
- `--refresh` → force recompute (spends even on cache hits).
- `--no-cache` → don't persist results (still spends).
- These four flags exist on `watch`, `extract`, `caption`, and `workflow`
  only — `ask`/`probe` always go to the cloud (use `search` for a free
  cached lookup).
- `meta.cache` in every envelope tells you what was reused vs written.

## Worked examples

```bash
# Analyze → structured extraction (schema-shaped)
tinycloud watch ./demo.mp4 --json \
  | tinycloud extract --schema ./schema.json --segment-level --json

# Caption → burn subtitles into the video
tinycloud caption ./demo.mp4 --format srt -o ./tinycloud-output/captions/ --json
tinycloud clip burn ./demo.mp4 \
  --subtitle-file ./tinycloud-output/captions/demo.srt \
  -o ./tinycloud-output/demo-captioned.mp4 --json

# Remote video → analyze
tinycloud grab https://youtu.be/<id> -o ./tinycloud-output/grabbed/ --json
tinycloud watch ./tinycloud-output/grabbed/<file>.mp4 --json

# Collection: mirror artifacts locally, then search/Q&A against it
tinycloud library collections sync col_123 --artifacts descriptions,transcripts --json
tinycloud probe "pricing discussion" --in collection:col_123 --scope segment --json
tinycloud ask "What did customers object to?" --in collection:col_123 --json

# Faces at collection scale (0.3.4+): build a face-analysis collection, then search a face across it
tinycloud library collections create faces --type face-analysis --json   # returns the new col_… id in data
tinycloud library collections add ./interview.mp4 --to col_123 --json    # uploads a local source first
tinycloud face list ./interview.mp4 --in collection:col_123 --json       # stored detections for that video
tinycloud face search ./headshot.jpg --in collection:col_123 --group-by file --json

# Extract timestamped findings → cut them into clips
tinycloud watch ./talk.mp4 --json \
  | tinycloud extract "the three strongest quotes with timestamps" --json \
  | tinycloud clip cut --from-findings -o ./tinycloud-output/quotes/ --json
```

## Render-review loop (videos your code generates)

When the host project's code produces a video (Remotion, Manim, ffmpeg
filter graphs, slide-render pipelines, recorded E2E runs), don't stop at a
successful render exit code — a clean render is not a good video. Use
tinycloud as the eyes in the edit loop:

```bash
# 1. Render with the project's own tooling (example: Remotion).
npx remotion render Promo out/promo.mp4

# 2. Evaluate the result.
tinycloud watch ./out/promo.mp4 --segment shots --json \
  | tinycloud extract "Evaluate pacing, text readability and clipping, scene \
      continuity, and audio/visual sync. Return timestamped findings with \
      severity and concrete edit instructions." --json

# 3. Map each finding's timestamp to code (frame = seconds x fps for
#    frame-based renderers), apply fixes, rerender to the SAME path.

# 4. Re-evaluate, feeding the previous findings back so the model confirms fixes.
tinycloud watch ./out/promo.mp4 --segment shots --json \
  | tinycloud extract "Re-evaluate this render. Previous findings: <summarize \
      prior findings>. Confirm whether each is resolved and report any new \
      issues." --json
```

Loop rules:

- Stop when findings are empty or low-severity only; then report done with
  the final findings summary. "Done" means evaluated, not rendered.
- Hunting sub-second flash frames or rapid cuts? Tighten the shot pass with
  `--shot-min-seconds 0.6` (fractional values allowed);
  `--shot-max-seconds` caps overly long shots the same way.
- Each rerender is a new file, so each iteration uploads and runs through
  the configured Cloudglue API key
  (https://app.cloudglue.dev/home/billing/rate-card). Tell the user, and
  prefer short/low-res preview renders while iterating when the project
  supports them.
- Reuse the same output path between iterations so stale renders don't pile
  up; the new file content makes the cache treat it as a new source (that is
  correct — you want the new render evaluated, not the cached old one).

You own the renderer-specific half of the loop (mapping timestamps to frames
and code, editing, rerendering); tinycloud only ever sees the media file.
The loop applies to any pipeline that emits video.
