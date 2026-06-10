# Tinycloud

Agent CLI for deep video work. Point it at videos and ask for analysis,
dashboards, subtitles, clips, search, or repurposed content — or drive its
verbs directly from your own agent. Powered by [Cloudglue](https://cloudglue.dev).

## Install

### curl

```bash
# Latest stable
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash

# Pinned version / channel
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- --version 0.3.0
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- --channel beta
```

Installs to `~/.tinycloud/bin` and adds it to your shell PATH.

### npm / npx

```bash
npm install -g @cloudglue/tinycloud     # then: tinycloud
npx @cloudglue/tinycloud                # or run directly
```

The npm package is a small launcher: on first run it downloads the matching
platform distribution from Cloudglue's CDN (cached under
`~/.tinycloud/versions/<version>/`), verifies its checksum, and execs the real
binary. The package version pins the binary version, so
`npx @cloudglue/tinycloud@0.3.0` always runs tinycloud 0.3.0. It also adds two
wrapper commands:

```bash
tinycloud install --version 0.3.0   # pre-download a version
tinycloud install --latest          # install latest stable and pin to it
tinycloud update                    # move to latest stable, prune old versions
```

Platforms: macOS (arm64, x64) and Linux (x64, arm64). Windows is not
supported — use WSL2.

### Setup

Cloud features need a Cloudglue API key:

```bash
tinycloud setup cloudglue --api-key <key>   # or: export CLOUDGLUE_API_KEY=...
tinycloud setup --check --json              # verify
```

## Use tinycloud from your agent

This repo also distributes agent skills that teach coding agents (Claude
Code, Codex, and anything else following the
[Agent Skills](https://agentskills.io) standard) to drive the tinycloud CLI.

**Claude Code** (as a plugin):

```text
/plugin marketplace add cloudglue/tinycloud
/plugin install tinycloud@tinycloud
```

**Any agent** (raw skill folders — copy into your agent's skills directory):

```bash
cp -r skills/* ~/.claude/skills/        # Claude Code personal skills
```

| Skill | What it does |
|---|---|
| `tinycloud` | The general skill: full CLI usage, JSON envelope contract, verbs, workflows, troubleshooting |
| `sales-coaching` | Sales call → coaching dashboard (scores, speech metrics, objections) |
| `blog-post` | Video → rich blog post with sections, thumbnails, takeaways |
| `ad-analysis` | Video ad → shot timeline, hook, pacing, CTA breakdown |
| `meeting-breakdown` | Meeting recording → speaker timeline, summaries, action items |
| `youtube-publish` | Video → YouTube title, description, chapters, tags, subtitles |
| `tinycloud-skill-creator` | Author your own tinycloud-powered skills (recipe + render script) |

Each skill checks compatibility first via `skills/tinycloud/scripts/preflight.sh`,
which gates on the installed binary's version and feature ids
(`skills/tinycloud/tinycloud-skill.json` declares the requirements).

## Environment variables

| Variable | Used by | Effect |
|---|---|---|
| `CLOUDGLUE_API_KEY` | binary | Cloudglue API key |
| `TINYCLOUD_INSTALL_DIR` | curl installer | target bin dir (default `~/.tinycloud/bin`) |
| `TINYCLOUD_INSTALL_DIR` | npm wrapper | cache root (default `~/.tinycloud`; versions under `versions/`) |
| `TINYCLOUD_VERSION` | both | version to install/run |
| `TINYCLOUD_DIST_URL` | both | distribution base URL override |
| `TINYCLOUD_REQUIRE_MANIFEST` | both | `=1`: fail if the signed release manifest is missing |

## Integrity

Releases publish a `manifest.json` (versions, platforms, URLs, sizes,
sha256) plus per-tarball `.sha256` sidecars. Both installers verify checksums
when available and always **fail closed on a mismatch**. Set
`TINYCLOUD_REQUIRE_MANIFEST=1` to also fail when the manifest is missing.

## Maintainers: release runbook

1. Upstream release uploads `tinycloud-<platform>-<version>.tar.gz` (×4) and
   refreshes the `tinycloud-<platform>.tar.gz` latest aliases on the CDN.
2. Generate and upload the manifest + sidecars:
   ```bash
   node scripts/generate-manifest.mjs --version <version> --from-cdn
   # then run the printed aws s3 cp / cloudfront invalidation commands
   node scripts/generate-manifest.mjs --check --version <version>
   ```
3. In this repo: bump `package.json` to `<version>`, commit, tag `v<version>`,
   push. The `publish-npm` workflow verifies the CDN and publishes
   `@cloudglue/tinycloud` (requires the `NPM_TOKEN` secret).

Wrapper-only emergency fixes publish as `<version>-wrapper.N` with the
`latest` dist-tag moved manually.

## License

© Aviary Inc. (d/b/a Cloudglue). All rights reserved. Use is subject to [Aviary Inc. Terms of Service](https://cloudglue.dev/terms).
