# Setup: install, credentials, and verification

## Install

```bash
npm install -g @cloudglue/tinycloud     # then run: tinycloud
# or run directly without installing:
npx @cloudglue/tinycloud --version --json
```

The npm package is a small launcher: on first run it downloads the matching
platform distribution (cached under `~/.tinycloud/versions/<version>/`),
verifies its checksum, and execs the real binary. The package version pins
the binary version, so `npx @cloudglue/tinycloud@<v>` always runs that exact
tinycloud. `tinycloud update` moves to the latest release.

Alternative (shell installer, installs to `~/.tinycloud/bin`):

```bash
curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
```

Platforms: macOS (arm64, x64) and Linux (x64, arm64). Windows is not
supported — use WSL2. More at https://tinycloud.sh.

## Credentials

Cloud verbs (`watch extract probe ask publish`) need a Cloudglue API key.
Usage is billed to that key per the
[rate card](https://app.cloudglue.dev/home/billing/rate-card).

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
  "git_sha": "…",
  "build_id": "0.3.0+…",
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
| `TINYCLOUD_VERSION` | npm launcher: run a specific binary version |
| `TINYCLOUD_INSTALL_DIR` | npm launcher: cache root (default `~/.tinycloud`) |
