# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **public distribution repo** for tinycloud (an agent CLI for video work,
powered by Cloudglue — https://tinycloud.sh). It does NOT contain tinycloud
itself; the binary is built from a private source repo and served from a CDN
at `https://media.cloudglue.dev/tinycloud-dist/`. This repo ships three
surfaces, and must never depend on the private repo at runtime:

1. **`install.sh`** — shell installer (deployed to `https://app.cloudglue.dev/tinycloud.sh`)
2. **`@cloudglue/tinycloud` npm package** — `bin/tinycloud.js` + `lib/`, a
   zero-dependency launcher that downloads the platform tarball on first run,
   verifies sha256, caches under `~/.tinycloud/versions/<v>/`, and execs the
   real binary
3. **Agent skills** under `skills/` — teach Claude Code/Codex/any
   agentskills.io agent to drive the tinycloud CLI; also exposed as a Claude
   Code plugin via `.claude-plugin/` (plugin source `"./"`, skills discovered
   from `skills/`)

## Commands

```bash
npm test                                  # unit + e2e against a local fixture CDN (fully offline)
node --test test/unit.test.mjs            # just the unit suite
TINYCLOUD_TEST_TARBALL=~/Downloads/tinycloud-darwin-arm64.tar.gz npm test   # e2e against a real dist tarball

# Contract smoke tests against an installed/extracted binary
TINYCLOUD_CMD=/path/to/tinycloud EXPECTED_VERSION=0.3.2 bash scripts/smoke-test.sh

# Serve a tarball as a fake CDN (modes: --corrupt, --no-manifest)
node test/fixtures/make-fixture-cdn.mjs --tarball <path>.tar.gz --version 0.3.2 --port 8787
TINYCLOUD_DIST_URL=http://127.0.0.1:8787 TINYCLOUD_INSTALL_DIR=$(mktemp -d) node bin/tinycloud.js --version --json
TINYCLOUD_DIST_URL=http://127.0.0.1:8787 bash install.sh --install-dir $(mktemp -d)/bin

# Release manifest tooling (maintainer)
node scripts/generate-manifest.mjs --version 0.3.2 --from-cdn   # build manifest + .sha256 sidecars
node scripts/generate-manifest.mjs --check --version 0.3.2      # verify live CDN matches manifest

# Plugin metadata validation
claude plugin validate .
shellcheck install.sh scripts/smoke-test.sh skills/tinycloud/scripts/preflight.sh
```

When testing `install.sh` locally, isolate `HOME` (`HOME=$(mktemp -d) bash
install.sh ...`) — otherwise it appends a PATH line for your temp install dir
to your real shell rc file.

## Architecture

### Version/distribution model

- npm package version == tinycloud binary version, **1:1**. The launcher
  defaults to running its own `package.json` version, so
  `npx @cloudglue/tinycloud@X` deterministically runs binary X. Runtime
  resolution order: `TINYCLOUD_VERSION` env → `~/.tinycloud/wrapper-version`
  (written by `install --latest`/`update`) → package version.
- CDN naming: `tinycloud-<platform>.tar.gz` (latest alias) and
  `tinycloud-<platform>-v<version>.tar.gz` (pinned tarballs are
  **v-prefixed** on the CDN; version strings are bare everywhere else).
  Platforms: darwin-arm64, darwin-x64, linux-x64, linux-arm64.
- `manifest.json` on the CDN (`{schema:1, channels:{stable,beta}, versions:{<v>:{platforms:{<p>:{url,size,sha256}}}}}`)
  is the resolution source of truth when present. "Latest" resolves through
  `channels.stable` to a pinned, checksummed URL; channel installs and
  `tinycloud update` are impossible without it.
- **Integrity policy** (identical in both installers): the manifest is an
  optimization, never a requirement — missing OR unusable (network failure,
  5xx, captive-portal HTML, truncated JSON, future schema) degrades with a
  warning to the direct-URL + `.sha256`-sidecar path. Checksum *mismatch*
  always fails closed. `TINYCLOUD_REQUIRE_MANIFEST=1` means
  **verified-or-fail** (unusable manifest or no checksum → hard error).
  Pinned versions missing from the manifest fall back to the conventional
  URL; a `latest` pin falls back to the newest healthy cached install when
  offline. `TINYCLOUD_DIST_URL` rebases the manifest's absolute URLs.
  CloudFront returns **403 for missing S3 keys** — treat 403 and 404 both
  as "missing".
- **Upgrade cleanup is manifest-of-members**: each install.sh run records
  the tarball member list in `<install-dir>/.tinycloud-files` and the next
  install removes exactly those paths (user files anywhere survive). The
  name-allowlist scan is only a legacy fallback for pre-record installs.
- `install.sh` (bash) and `lib/manifest.js` (node) implement the same
  resolution logic; changes to one must mirror the other.
- The launcher chain: `bin/tinycloud.js` (dispatch; owns the
  `install`/`update`/`skills` subcommands — the binary must never add verbs
  with those names; a regression test in the source repo guards this) →
  `lib/platform.js` → `lib/manifest.js` → `lib/download.js` (sha256 computed
  in the same pass as the stream; curl fallback when `HTTPS_PROXY` is set) →
  `lib/installer.js` (extract-then-atomic-rename, `.ok` marker written only
  after verified download + full extraction) → `lib/run.js` (stdio inherit,
  signal forwarding, 128+n exit semantics).
- Gotcha: `TINYCLOUD_INSTALL_DIR` means the *bin dir* to install.sh
  (`~/.tinycloud/bin`) but the *cache root* to the npm launcher (`~/.tinycloud`).

### Binary contract (what everything asserts against)

`tinycloud --version --json` reports `version`, `protocol_version`,
`envelope_schema`, `workflow_schema`, `command_spec_revision`, and
`features[]` (e.g. `workflow.v1`). Every command emits a JSON envelope on
stdout (logs on stderr) with `status`:
`ready | pending | needs_credentials | needs_upload | needs_download | paused | error`
→ exit codes 0/0/2/3/3/0/1. `tinycloud commands --json` is the authoritative
flag list — verify doc claims against it, not memory (a doc bug shipped once
because `--cached` only exists on watch/extract/caption/workflow).

**Pre-0.3.0 binaries open an interactive TUI on `--version --json`** instead
of printing JSON. Any script invoking the binary must redirect `</dev/null`
(and ideally bound with a timeout — see `run_with_timeout` in
`scripts/smoke-test.sh`) or it will hang on old installs.

### Skills

- The npm package bundles `skills/` (see `files` in package.json);
  `npx @cloudglue/tinycloud skills install` (`lib/skills.js`) copies them
  into harness dirs without touching the binary cache. The four known
  harnesses live in the `HARNESSES` table, each at `<configDir>/skills`:
  `claude-code`→`.claude`, `agents`→`.agents` (universal agentskills.io
  layout), `codex`→`.codex`, `cursor`→`.cursor`. In a TTY with no explicit
  target it shows an interactive menu (detected dirs preselected, via
  `promptForTargets`); non-interactive/`--yes` runs use `resolveTargets`,
  which installs into every detected dir (default `.claude` when none).
  `--harness <ids>` selects explicitly; `--global` is Claude-only
  (`~/.claude/skills`); `--dir`/`--skill` also override. `resolveTargets`
  stays pure (no prompting) so it's unit-testable.
- `skills/tinycloud/` is the flagship: SKILL.md + `reference/*.md`
  (progressive disclosure) + `scripts/preflight.sh` + `tinycloud-skill.json`
  (compat manifest: `min_version`, `supported_range`, `required_features`).
  `skills/tinycloud-init/` is the guided first-time setup.
- `preflight.sh` prints exactly ONE actionable line; exit codes: 0 ok /
  10 binary missing / 11 version too low / 12 missing features /
  13 missing credentials. Its `REQUIRED_FEATURES` list must stay identical to
  `tinycloud-skill.json` — CI diffs them.
- The 5 workflow skills (sales-coaching, blog-post, ad-analysis,
  meeting-breakdown, youtube-publish) are thin wrappers over recipes bundled
  *inside the binary* (`tinycloud workflow <name> <source> --allow-command --json`);
  they ship no yaml/scripts. `tinycloud-skill-creator` wraps the binary's
  bundled scaffolder.
- **Selective-install invariant** (verified against `npx skills add`): the
  skill *directory* is the unit of distribution — installing one skill copies
  only that folder. A skill may only reference files inside its own folder;
  any cross-skill mention must be conditional prose ("if the `tinycloud`
  skill is installed…") with an inline fallback, never a relative path link.
- Billing wording: cloud verbs "run through the configured Cloudglue API key"
  (rate card: https://app.cloudglue.dev/home/billing/rate-card) — avoid
  "costs money" phrasing.

### CI (.github/workflows/)

- `ci.yml`: PR-gating jobs (wrapper unit/e2e, shellcheck, plugin/skill
  metadata sync) vs live-CDN jobs (`Install + smoke` matrix, npx-against-CDN)
  which run only on push to main or manual dispatch — never on PRs, because a
  CDN gap would fail every PR.
- The live CDN serves 0.3.2 (latest aliases + v-prefixed pinned tarballs
  for 0.3.0, 0.3.1, and 0.3.2, with `manifest.json` + `.sha256` sidecars;
  `channels.stable` = 0.3.2); all smoke legs are required.
- `publish-npm.yml` (tag `v*`): asserts tag == package.json version → gates
  on `generate-manifest.mjs --check` against the live CDN → publishes via
  npm trusted publishing (OIDC, `id-token: write`, npm ≥ 11.5.1 — no token
  secret; provenance is automatic). The trusted-publisher connection is
  configured on the npm package settings page (workflow `publish-npm.yml`).

## Verifying changes

For skill/doc changes, ground claims in a real binary: extract a dist tarball
(`tar -xzf tinycloud-darwin-arm64.tar.gz -C /tmp/tinycloud-test`) and check
`--version --json`, `commands --json`, and `workflow validate <recipe> --json`
against what the docs say. Skill behavior can be tested headlessly:
`cd <project> && claude -p "<task using the skill>" --allowedTools "Bash,Read,Glob,Grep,Skill"`
with the skills copied into `<project>/.claude/skills/`.
