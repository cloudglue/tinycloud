---
name: tinycloud-init
description: >-
  Set up tinycloud from scratch: install the CLI, configure the Cloudglue API
  key, verify everything works, and run a first command. Use when the user
  wants to get started with tinycloud, set up / initialize / onboard
  tinycloud, or when another tinycloud skill reports the CLI or credentials
  are missing.
argument-hint: "[optional: a video file to test with]"
arguments: video
---

# Set up tinycloud

Walk the user from nothing to a working, verified tinycloud install. End the
session with one successful command, not a checklist. Work through the steps
in order, skipping any that already pass.

## 1. Is the CLI installed?

```bash
command -v tinycloud && tinycloud --version --json </dev/null
```

If installed and the JSON reports `"version"` ≥ 0.3.4 (the floor the tinycloud
skill requires), go to step 2. If missing, older than 0.3.4, or no
machine-readable version, install or upgrade it — ask the user which they
prefer:

```bash
npm install -g @cloudglue/tinycloud          # canonical (Node >= 18); reinstall to upgrade
# or
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
tinycloud update                             # already installed but older → move to latest stable
```

The first run downloads the platform distribution (~90 MB, one time). More
at https://tinycloud.sh. Windows is unsupported — use WSL2.

## 2. Is a Cloudglue API key configured?

```bash
tinycloud setup --check --json </dev/null
```

If `data.ok` is `true`, go to step 3. Otherwise tell the user: cloud
features run through a Cloudglue account — keys live at
[app.cloudglue.dev](https://app.cloudglue.dev) (usage billed per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card)). Ask them to
paste their API key, then configure it via stdin so the key never lands in
shell history or process args:

```bash
printf '%s' "<key>" | tinycloud setup cloudglue --stdin
```

Re-run `tinycloud setup --check --json` and confirm `data.ok == true`.

## 3. Prove it works (free)

```bash
tinycloud workflow validate summary --json    # exercises the recipe engine, no cloud calls
```

Expect `status: "ready"`. If the user provided a video (`$video`) or has one
handy, also show them something real — still free and local:

```bash
tinycloud clip info <video> --json            # duration/resolution/codecs via bundled ffprobe
```

## 4. Hand off

Report what's now working and point forward:

- "Analyze a video": `tinycloud watch <video> --json` (first cloud call —
  uses the API key)
- One-command workflows: `tinycloud workflow list --json` (sales-coaching,
  blog-post, ad-analysis, meeting-breakdown, youtube-publish, …)
- Multiple accounts or isolated installs (0.3.3+): `tinycloud profile create
  <name> --default`, then `--profile <name>` (or `--home <dir>` /
  `$TINYCLOUD_HOME`) on any command to switch state homes
- If the general `tinycloud` skill is installed alongside this one, it
  documents the full CLI, envelope contract, and a glossary; its
  `scripts/preflight.sh` re-checks this setup any time.

## Troubleshooting

- `tinycloud` found but `--version --json` prints a UI instead of JSON →
  pre-0.3.0 install; upgrade via either install command above.
- `setup --check` reports `ok: false` after configuring → key was rejected;
  re-paste it (watch for stray whitespace) or generate a fresh key.
- Corporate proxy: the npm launcher honors `HTTPS_PROXY` (falls back to
  curl for the download).
