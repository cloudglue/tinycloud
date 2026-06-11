---
name: youtube-publish
description: >-
  Generate YouTube publishing metadata from a video: title, description,
  chapter markers, tags, SRT subtitles, and an HTML copy page to paste from.
  Use when the user is preparing a video for YouTube upload and wants the
  metadata and subtitles generated. Takes one source: a local video file,
  URL, or cloudglue:// file URI (e.g. cloudglue://files/<id>). Runs the built-in tinycloud "youtube-publish"
  workflow; requires the tinycloud CLI configured with a Cloudglue API key
  (analysis runs through the user's Cloudglue account).
argument-hint: "[video file, URL, or cloudglue:// file URI]"
arguments: source
---

# YouTube publish kit

This skill is a thin wrapper around the `youtube-publish` workflow recipe
bundled inside the tinycloud binary (`watch → extract → thumbnails →
captions → render`). It generates SRT subtitles itself as part of the run.

## Run

1. **Check the CLI.** If the general `tinycloud` skill is installed alongside
   this one, run its `scripts/preflight.sh`. Otherwise verify directly:

   ```bash
   tinycloud setup --check --json   # ready when data.ok == true
   ```

   Missing CLI: `npm install -g @cloudglue/tinycloud` (see https://tinycloud.sh).
   Missing key: `tinycloud setup cloudglue --api-key <key>`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate youtube-publish --json
   ```

3. **Run it** with the user's source. The analysis steps run through the
   configured Cloudglue API key — if the user has not clearly asked to run
   it, show the step plan first with
   `tinycloud workflow plan youtube-publish $source --json` (free).

   ```bash
   tinycloud workflow youtube-publish $source --json
   ```

   Useful params: `--param segment=chapters` (default; produces the chapter
   markers YouTube descriptions need) or `--param segment=uniform:20` for a
   lighter pass on short videos; `--param out=<path>` for the HTML location.

## Read the result

Parse the single JSON envelope from stdout (machine output; logs are stderr):

- Success: `status == "ready"` and `data.status == "completed"`.
- The copy page is `data.outputs.html`; the run dir also contains the
  generated SRT under `captions/` (listed in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/youtube-publish.html`.
- Report the HTML path and the SRT path. The page renders even when
  subtitles were unavailable.

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop, report the envelope's
`error.message`, and follow its `setup` / `resume` / `next` hints. The general
`tinycloud` skill (if installed) documents full status handling.
