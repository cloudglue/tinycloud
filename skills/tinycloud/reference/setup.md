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

Cloud verbs (`watch extract probe ask publish face`) need a Cloudglue API key
(as do `library collections add` and the collection reads).
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
| `TINYCLOUD_HOME` | Isolated state home — config, sessions, cache, jobs, artifacts, skills (default `~/.tinycloud`; same as `--home`). 0.3.3+ |
| `TINYCLOUD_OUT` | Output base for generated files (wins over a config `outputBase`) |
| `TINYCLOUD_HTTP_TIMEOUT_MS` | Hard deadline per Cloudglue request (default 120s; `0` disables) |
| `TINYCLOUD_UPLOAD_TIMEOUT_MS` | Total deadline for upload-shaped requests (default 60min; `0` disables) |
| `TINYCLOUD_UPLOAD_IDLE_TIMEOUT_MS` | Idle (no-progress) deadline for an upload — aborts a wedged transfer in ~1min instead of waiting out the total upload deadline (default 60s; `0` disables) |
| `TINYCLOUD_HTTP_RETRIES` | Bounded auto-retries for idempotent (GET/HEAD) Cloudglue calls on transient errors — 408/429/5xx, network blips (default 3; `0` disables) |
| `TINYCLOUD_JOB_WAIT_TIMEOUT_MS` | Wall-clock budget for async job waits (the `waitForReady` poll behind `watch`/`extract`/`face`) (default 10min; `0` disables) |

Every Cloudglue request carries a hard deadline, so a stalled route can never
hang the CLI indefinitely; a timeout surfaces as a retryable `upstream` error
envelope whose message names the knob to adjust. Idempotent reads (GET/HEAD,
including the status polls behind async waits) auto-retry transient failures
(408/429/5xx, network blips, idle-timeout aborts) with backoff + jitter before
surfacing, and uploads abort early if no progress is seen within the idle
window. Non-idempotent mutations (upload/create/add/delete) are never
auto-retried — a retryable `upstream` there is yours to re-issue.

## Profiles & isolated homes (0.3.3+)

Every piece of tinycloud state — config, sessions, cache, jobs, artifacts, and
skills — lives under one home (default `~/.tinycloud`). Relocate it to run
multiple accounts or installs side by side without cross-contamination. Both
options are *leading* (before the verb) and work with any command:

- `--home <dir>` (or `$TINYCLOUD_HOME`) — use that directory as the home.
- `--profile <name>` — use a named profile's home (from the profiles registry).

Named profiles are managed by the host-level `profile` verb (a CLI/host
concern, so it is not in `commands --json`):

```bash
tinycloud profile list                     # profiles and their homes (active marked *)
tinycloud profile show [<name>]            # home path + exists/default/active
tinycloud profile create <name> [--home <dir>] [--copy-from <name>] \
                                 [--description <text>] [--default]
tinycloud profile use <name>               # set the default profile
tinycloud profile remove <name>            # unregister (does not delete the home)
```

`--copy-from` seeds the new profile's home from an existing one. The registry
lives at `$XDG_CONFIG_HOME/tinycloud/profiles.json`; `default` is reserved.
This global `--profile <name>` is unrelated to `watch --profile
default|light|custom` (that flag selects an analysis profile).

## Project scope (0.3.3+)

Within a home, sessions are scoped per project — keyed by the canonical git
root — under `<home>/projects/<project-key>/sessions`. In the interactive
agent, `/sessions` lists the current project's sessions (`/sessions all` spans
every project); `-c` resumes the most recent and still falls back to legacy
flat sessions (read-only, migrated forward on resume).

A project can also carry a local `.tinycloud/config.json` that scopes a run:

- `preferences.tools` / `preferences.skills` — allowlists of agent tool / skill
  names (omit = all; the `--tools` / `--skills` flags override them).
- `preferences.outputBase` — where generated files land (a relative path is
  anchored to the project root; `$TINYCLOUD_OUT` still wins).

Precedence is **CLI flags > project-local `.tinycloud/config.json` > global
config**; a more specific scope replaces (does not merge) a broader one.
Read-only mode always keeps the `read` and `bash` tools.
