---
name: youtube-publish
description: >-
  Generate YouTube publishing metadata from a video: title, description,
  chapter markers, tags, SRT subtitles, and an HTML copy page to paste from.
  Use when the user is preparing a video for YouTube upload and wants the
  metadata and subtitles generated. Takes one source: a local video file,
  URL, or Cloudglue file id. Runs the built-in tinycloud "youtube-publish"
  workflow; requires the tinycloud CLI with a Cloudglue API key, and the
  analysis steps make cloud calls that cost money.
argument-hint: "[video file, URL, or Cloudglue file id]"
arguments: source
---

# YouTube publish kit

This skill is a thin wrapper around the `youtube-publish` workflow recipe
bundled inside the tinycloud binary (`watch → extract → thumbnails →
captions → render`). It generates SRT subtitles itself as part of the run.
General CLI usage, envelope schema, and troubleshooting live in the
`tinycloud` skill.

## Run

1. **Preflight.** Run the `tinycloud` skill's `scripts/preflight.sh` and
   follow its one-line instruction if it does not report `ok`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate youtube-publish --json
   ```

3. **Run it** with the user's source. This makes Cloudglue cloud calls that
   cost money — if the user has not clearly asked to run it, show the step
   plan first with `tinycloud workflow plan youtube-publish $source --json`
   (free).

   ```bash
   tinycloud workflow youtube-publish $source --allow-command --json
   ```

   Useful params: `--param segment=chapters` (default; produces the chapter
   markers YouTube descriptions need) or `--param segment=uniform:20` for a
   cheaper pass on short videos; `--param out=<path>` for the HTML location.

## Read the result

- Success: `status == "ready"` and `data.status == "completed"`.
- The copy page is `data.outputs.html`; the run dir also contains the
  generated SRT under `captions/` (listed in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/youtube-publish.html`.
- Report the HTML path and the SRT path. The page renders even when
  subtitles were unavailable.

Any other `status` or `data.status` of `partial`/`failed`: stop and follow
the status table in the `tinycloud` skill (reference/envelope.md).
