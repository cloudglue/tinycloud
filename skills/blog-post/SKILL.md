---
name: blog-post
description: >-
  Transform a video into a rich blog post (HTML + embedded markdown) with
  sections, thumbnails, and key takeaways. Use when the user wants to turn a
  video, talk, demo, or tutorial into a written article or blog content.
  Takes one source: a local video file, URL, or cloudglue:// file URI (e.g. cloudglue://files/<id>). Runs the
  built-in tinycloud "blog-post" workflow; requires the tinycloud CLI
  configured with a Cloudglue API key (analysis runs through the user's
  Cloudglue account).
argument-hint: "[video file, URL, or cloudglue:// file URI]"
arguments: source
---

# Video → blog post

This skill is a thin wrapper around the `blog-post` workflow recipe bundled
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
   tinycloud workflow validate blog-post --json
   ```

3. **Run it** with the user's source. The analysis steps run through the
   configured Cloudglue API key — if the user has not clearly asked to run
   it, show the step plan first with
   `tinycloud workflow plan blog-post $source --json` (free).

   ```bash
   tinycloud workflow blog-post $source --json
   ```

   Useful params: `--param segment=chapters` (default; semantic section
   anchors) or `--param segment=uniform:20` for a lighter pass;
   `--param out=<path>` to control the HTML location.

## Read the result

Parse the single JSON envelope from stdout (machine output; logs are stderr):

- Success: `status == "ready"` and `data.status == "completed"`.
- The article path is `data.outputs.html` (also in `data.artifacts[]`).
  Default: `./tinycloud-output/runs/<data.run_id>/blog-post.html`.
- Report the HTML path; offer
  `tinycloud publish <html> --name blog-post --visibility private --json`
  to host it as a shareable page. Share the returned `data.url` (fresh
  content can take ~1 min to appear there; `data.version_url` is live
  immediately, so a brief 403 at `data.url` is not a failure).

Any other `status` (`needs_credentials`, `needs_upload`, `pending`, `paused`,
`error`) or `data.status` of `partial`/`failed`: stop, report the envelope's
`error.message`, and follow its `setup` / `resume` / `next` hints. The general
`tinycloud` skill (if installed) documents full status handling.
