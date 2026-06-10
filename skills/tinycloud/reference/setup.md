# Setup: install, credentials, and verification

## Install

```bash
# Latest stable
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash

# Pinned version
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- --version 0.3.0

# npm / npx (downloads the binary on first run)
npm install -g @cloudglue/tinycloud
npx @cloudglue/tinycloud --version --json
```

The curl installer puts the binary at `~/.tinycloud/bin/tinycloud` (override
with `TINYCLOUD_INSTALL_DIR`) and adds it to your shell PATH. The npm wrapper
caches full distributions under `~/.tinycloud/versions/<version>/`.

Platforms: macOS (arm64, x64) and Linux (x64, arm64). Windows is not
supported — use WSL2.

## Credentials

Cloud verbs (`watch extract probe ask publish`) need a Cloudglue API key:

```bash
tinycloud setup cloudglue --api-key <key>     # persist the key
# or
export CLOUDGLUE_API_KEY=<key>                # env only, nothing persisted
```

`frameio` is an optional service and requires interactive OAuth
(`tinycloud setup frameio` inside the tinycloud agent TUI).

## Verifying an install

```bash
tinycloud --version --json
```

Returns (annotated):

```json
{
  "name": "tinycloud",
  "version": "0.3.0",            // semver — compare against min_version
  "git_sha": "57a775b",
  "build_id": "0.3.0+57a775b",
  "channel": "stable",
  "platform": "darwin",
  "arch": "arm64",
  "protocol_version": "1",       // CLI protocol contract
  "envelope_schema": "1",        // envelope shape version
  "workflow_schema": "1",        // workflow recipe schema version
  "command_spec_revision": "…",  // changes when commands/flags change
  "features": ["envelope.v1", "watch.v1", "..."]   // feature ids to gate on
}
```

```bash
tinycloud setup --check --json
```

Exits 0 even when unconfigured; branch on `data.ok`. `data.services[]` lists
each service with `configured`, `env`, `interactive_required`, and a
`message`. `data.capabilities` repeats the protocol/feature contract.

## Preflight script

`scripts/preflight.sh` (next to this skill's SKILL.md) checks everything and
prints exactly one actionable line:

| exit | meaning |
|---|---|
| 0  | ok — install, version, features, and credentials all good |
| 10 | tinycloud binary missing or broken — install |
| 11 | version below the skill's `min_version` — upgrade |
| 12 | required feature ids missing from `features[]` — upgrade |
| 13 | binary fine, Cloudglue credentials missing — configure key |

The version/feature requirements live in `tinycloud-skill.json`
(`min_version`, `supported_range`, `required_features`) and mirror what the
binary reports in `--version --json`.

## Environment variables

| Variable | Effect |
|---|---|
| `CLOUDGLUE_API_KEY` | Cloudglue API key (alternative to `tinycloud setup cloudglue`) |
| `TINYCLOUD_INSTALL_DIR` | curl installer: target bin dir (default `~/.tinycloud/bin`) |
