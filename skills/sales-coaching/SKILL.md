---
name: sales-coaching
description: >-
  Turn a sales-call recording into a coaching dashboard (HTML) with call
  scores, speech metrics, objections, and improvement areas. Use when the
  user wants sales-call analysis, call coaching, or rep feedback from a
  video/audio recording. Takes one source: a local video file, URL, or
  cloudglue:// file URI (e.g. cloudglue://files/<id>). Runs the built-in tinycloud "sales-coaching" workflow;
  requires the tinycloud CLI configured with a Cloudglue API key (analysis
  runs through the user's Cloudglue account).
argument-hint: "[sales call video file, URL, or cloudglue:// file URI]"
arguments: source
---

# Sales-call coaching dashboard

This skill is a thin wrapper around the `sales-coaching` workflow recipe
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
   tinycloud workflow validate sales-coaching --json
   ```

3. **Run it** with the user's source. The analysis steps (one describe + two
   extracts) run through the configured Cloudglue API key — if the user has
   not clearly asked to run it, show them the step plan first with
   `tinycloud workflow plan sales-coaching $source --json` (free).

   ```bash
   tinycloud workflow sales-coaching $source --json
   ```

   (The recipe self-permits its local render step — no extra flag needed.)
   Useful params: `--param segment=chapters` (default; semantic call phases) or
   `--param segment=uniform:20` for dense fixed intervals;
   `--param out=<path>` to control the HTML location.

## Read the result

Parse the single JSON envelope from stdout (machine output; logs are stderr):

- Success: `status == "ready"` and `data.status == "completed"`.
- The dashboard path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/sales-coaching.html`.
- Report the HTML path to the user; offer
  `tinycloud publish <html> --name sales-coaching --visibility private --json`
  to host it as a shareable page.

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop, report the envelope's
`error.message`, and follow its `setup` / `resume` / `next` hints. The general
`tinycloud` skill (if installed) documents full status handling.
