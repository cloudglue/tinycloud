---
name: sales-coaching
description: >-
  Turn a sales-call recording into a coaching dashboard (HTML) with call
  scores, speech metrics, objections, and improvement areas. Use when the
  user wants sales-call analysis, call coaching, or rep feedback from a
  video/audio recording. Takes one source: a local video file, URL, or
  Cloudglue file id. Runs the built-in tinycloud "sales-coaching" workflow;
  requires the tinycloud CLI with a Cloudglue API key, and the analysis steps
  make cloud calls that cost money.
argument-hint: "[sales call video file, URL, or Cloudglue file id]"
arguments: source
---

# Sales-call coaching dashboard

This skill is a thin wrapper around the `sales-coaching` workflow recipe
bundled inside the tinycloud binary (`watch → extract ×2 → render`). General
CLI usage, envelope schema, and troubleshooting live in the `tinycloud`
skill — do not reinvent them here.

## Run

1. **Preflight.** Run the `tinycloud` skill's `scripts/preflight.sh` and
   follow its one-line instruction if it does not report `ok`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate sales-coaching --json
   ```

3. **Run it** with the user's source. This makes Cloudglue cloud calls
   (one analysis + two extracts) that cost money — if the user has not
   clearly asked to run it, show them the step plan first with
   `tinycloud workflow plan sales-coaching $source --json` (free).

   ```bash
   tinycloud workflow sales-coaching $source --allow-command --json
   ```

   `--allow-command` permits the final local render step. Useful params:
   `--param segment=chapters` (default; semantic call phases) or
   `--param segment=uniform:20` for dense fixed intervals;
   `--param out=<path>` to control the HTML location.

## Read the result

Parse the single JSON envelope from stdout:

- Success: `status == "ready"` and `data.status == "completed"`.
- The dashboard path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/sales-coaching.html`.
- Report the HTML path to the user; offer
  `tinycloud publish <html> --name sales-coaching --visibility private --json`
  to host it as a shareable page.

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop and follow the status
table in the `tinycloud` skill (reference/envelope.md).
