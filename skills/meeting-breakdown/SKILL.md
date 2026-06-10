---
name: meeting-breakdown
description: >-
  Generate a visual meeting breakdown (HTML) with speaker timeline, topic
  labels, chapter summaries, and action items from a meeting recording. Use
  when the user wants meeting notes, a recap, action items, or a who-said-what
  timeline from a recorded meeting or call. Takes one source: a local video
  file, URL, or Cloudglue file id. Runs the built-in tinycloud
  "meeting-breakdown" workflow; requires the tinycloud CLI with a Cloudglue
  API key, and the analysis steps make cloud calls that cost money.
argument-hint: "[meeting recording file, URL, or Cloudglue file id]"
arguments: source
---

# Meeting breakdown

This skill is a thin wrapper around the `meeting-breakdown` workflow recipe
bundled inside the tinycloud binary (`watch → extract ×2 → render`). General
CLI usage, envelope schema, and troubleshooting live in the `tinycloud`
skill.

## Run

1. **Preflight.** Run the `tinycloud` skill's `scripts/preflight.sh` and
   follow its one-line instruction if it does not report `ok`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate meeting-breakdown --json
   ```

3. **Run it** with the user's source. This makes Cloudglue cloud calls
   (one analysis + two extracts) that cost money — if the user has not
   clearly asked to run it, show the step plan first with
   `tinycloud workflow plan meeting-breakdown $source --json` (free).

   ```bash
   tinycloud workflow meeting-breakdown $source --allow-command --json
   ```

   Useful params: `--param segment=chapters` (default; semantic meeting
   narrative) or `--param segment=uniform:20` for dense raw intervals;
   `--param out=<path>` to control the HTML location.

## Read the result

- Success: `status == "ready"` and `data.status == "completed"`.
- The breakdown path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/meeting-breakdown.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name meeting-breakdown --visibility private --json`
  to host it as a shareable page.

Any other `status` or `data.status` of `partial`/`failed`: stop and follow
the status table in the `tinycloud` skill (reference/envelope.md).
