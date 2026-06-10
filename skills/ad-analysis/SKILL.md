---
name: ad-analysis
description: >-
  Analyze a video ad into an HTML breakdown with shot timeline, hook
  classification, pacing, structure, CTA, and takeaways. Use when the user
  wants ad creative analysis, competitive ad research, or a hook/pacing/CTA
  breakdown of a commercial or social ad. Takes one source: a local video
  file, URL, or cloudglue:// file URI (e.g. cloudglue://files/<id>). Runs the built-in tinycloud "ad-analysis"
  workflow; requires the tinycloud CLI configured with a Cloudglue API key
  (analysis runs through the user's Cloudglue account).
argument-hint: "[ad video file, URL, or cloudglue:// file URI]"
arguments: source
---

# Video-ad analysis

This skill is a thin wrapper around the `ad-analysis` workflow recipe bundled
inside the tinycloud binary (`watch → extract → render`).

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
   tinycloud workflow validate ad-analysis --json
   ```

3. **Run it** with the user's source. The analysis steps run through the
   configured Cloudglue API key — if the user has not clearly asked to run
   it, show the step plan first with
   `tinycloud workflow plan ad-analysis $source --json` (free).

   ```bash
   tinycloud workflow ad-analysis $source --json
   ```

   Useful params: `--param segment=shots` (default; shot-level timeline the
   breakdown is built around) or `--param segment=uniform:20` for a lighter
   uniform pass; `--param out=<path>` to control the HTML location.

## Read the result

Parse the single JSON envelope from stdout (machine output; logs are stderr):

- Success: `status == "ready"` and `data.status == "completed"`.
- The analysis path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/ad-analysis.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name ad-analysis --visibility private --json`
  to host it as a shareable page.

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop, report the envelope's
`error.message`, and follow its `setup` / `resume` / `next` hints. The general
`tinycloud` skill (if installed) documents full status handling.
