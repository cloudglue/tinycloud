---
name: meeting-breakdown
description: >-
  Generate a visual meeting breakdown (HTML) with speaker timeline, topic
  labels, chapter summaries, and action items from a meeting recording. Use
  when the user wants meeting notes, a recap, action items, or a who-said-what
  timeline from a recorded meeting or call. Takes one source: a local video
  file, URL, or cloudglue:// file URI (e.g. cloudglue://files/<id>). Runs the built-in tinycloud
  "meeting-breakdown" workflow; requires the tinycloud CLI configured with a
  Cloudglue API key (analysis runs through the user's Cloudglue account).
argument-hint: "[meeting recording file, URL, or cloudglue:// file URI]"
arguments: source
---

# Meeting breakdown

This skill is a thin wrapper around the `meeting-breakdown` workflow recipe
bundled inside the tinycloud binary (`watch → extract ×2 → render`).

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
   tinycloud workflow validate meeting-breakdown --json
   ```

3. **Run it** with the user's source. The analysis steps (one describe + two
   extracts) run through the configured Cloudglue API key — if the user has
   not clearly asked to run it, show the step plan first with
   `tinycloud workflow plan meeting-breakdown $source --json` (free).

   ```bash
   tinycloud workflow meeting-breakdown $source --json
   ```

   Useful params: `--param segment=chapters` (default; semantic meeting
   narrative) or `--param segment=uniform:20` for dense raw intervals;
   `--param out=<path>` to control the HTML location.

## Read the result

Parse the single JSON envelope from stdout (machine output; logs are stderr):

- Success: `status == "ready"` and `data.status == "completed"`.
- The breakdown path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/meeting-breakdown.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name meeting-breakdown --visibility private --json`
  to host it as a shareable page.

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop, report the envelope's
`error.message`, and follow its `setup` / `resume` / `next` hints. The general
`tinycloud` skill (if installed) documents full status handling.
