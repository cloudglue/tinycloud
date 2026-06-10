---
name: blog-post
description: >-
  Transform a video into a rich blog post (HTML + embedded markdown) with
  sections, thumbnails, and key takeaways. Use when the user wants to turn a
  video, talk, demo, or tutorial into a written article or blog content.
  Takes one source: a local video file, URL, or Cloudglue file id. Runs the
  built-in tinycloud "blog-post" workflow; requires the tinycloud CLI with a
  Cloudglue API key, and the analysis steps make cloud calls that cost money.
argument-hint: "[video file, URL, or Cloudglue file id]"
arguments: source
---

# Video → blog post

This skill is a thin wrapper around the `blog-post` workflow recipe bundled
inside the tinycloud binary (`watch → extract → render`). General CLI usage,
envelope schema, and troubleshooting live in the `tinycloud` skill.

## Run

1. **Preflight.** Run the `tinycloud` skill's `scripts/preflight.sh` and
   follow its one-line instruction if it does not report `ok`.

2. **Confirm the recipe is available** (free, no cloud calls):

   ```bash
   tinycloud workflow validate blog-post --json
   ```

3. **Run it** with the user's source. This makes Cloudglue cloud calls that
   cost money — if the user has not clearly asked to run it, show the step
   plan first with `tinycloud workflow plan blog-post $source --json` (free).

   ```bash
   tinycloud workflow blog-post $source --allow-command --json
   ```

   Useful params: `--param segment=chapters` (default; semantic section
   anchors) or `--param segment=uniform:20` for a cheaper pass;
   `--param out=<path>` to control the HTML location.

## Read the result

- Success: `status == "ready"` and `data.status == "completed"`.
- The article path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/blog-post.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name blog-post --visibility private --json`
  to host it as a shareable page.

Any other `status` or `data.status` of `partial`/`failed`: stop and follow
the status table in the `tinycloud` skill (reference/envelope.md).
