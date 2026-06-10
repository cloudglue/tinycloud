---
name: ad-analysis
description: >-
  Analyze a video ad into an HTML breakdown with shot timeline, hook
  classification, pacing, structure, CTA, and takeaways. Use when the user
  wants ad creative analysis, competitive ad research, or a hook/pacing/CTA
  breakdown of a commercial or social ad. Takes one source: a local video
  file, URL, or Cloudglue file id. Runs the built-in tinycloud "ad-analysis"
  workflow; requires the tinycloud CLI with a Cloudglue API key, and the
  analysis steps make cloud calls that cost money.
argument-hint: "[ad video file, URL, or Cloudglue file id]"
arguments: source
---

# Video-ad analysis

This skill is a thin wrapper around the `ad-analysis` workflow recipe bundled
inside the tinycloud binary (`watch → extract → render`). General CLI usage,
envelope schema, and troubleshooting live in the `tinycloud` skill.

## Run

1. **Preflight.** Run the `tinycloud` skill's `scripts/preflight.sh` and
   follow its one-line instruction if it does not report `ok`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate ad-analysis --json
   ```

3. **Run it** with the user's source. This makes Cloudglue cloud calls that
   cost money — if the user has not clearly asked to run it, show the step
   plan first with `tinycloud workflow plan ad-analysis $source --json` (free).

   ```bash
   tinycloud workflow ad-analysis $source --allow-command --json
   ```

   Useful params: `--param segment=shots` (default; shot-level timeline the
   breakdown is built around) or `--param segment=uniform:20` for a cheaper
   uniform pass; `--param out=<path>` to control the HTML location.

## Read the result

- Success: `status == "ready"` and `data.status == "completed"`.
- The analysis path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/ad-analysis.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name ad-analysis --visibility private --json`
  to host it as a shareable page.

Any other `status` or `data.status` of `partial`/`failed`: stop and follow
the status table in the `tinycloud` skill (reference/envelope.md).
