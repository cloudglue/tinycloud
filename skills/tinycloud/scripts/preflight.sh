#!/usr/bin/env bash
# Tinycloud skill preflight. Prints exactly ONE actionable line and exits:
#   0  ok — tinycloud is installed, compatible, and configured
#   10 tinycloud binary missing (or broken)
#   11 installed version outside the supported range (too old or too new)
#   12 installed version lacks required feature ids
#   13 installed and compatible but Cloudglue credentials are missing
set -u

# Mirror tinycloud-skill.json: min_version / supported_range upper bound
# (CI diffs these against the manifest).
MIN_VERSION="0.3.4"
MAX_VERSION_EXCLUSIVE="0.4.0"
INSTALL_CMD='curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash'
# Kept in sync with ../tinycloud-skill.json required_features (CI diffs them).
REQUIRED_FEATURES="envelope.v1 watch.v1 extract.v1 caption.v1 search.v1 probe.v1 ask.v1 clip.v1 grab.v1 face.v1 jobs.v1 library.collections.v1 library.collections.create.v1 library.collections.mutate.v1 library.collections.entities.v1 library.sync.url.v1 workflow.v1 publish.v1 publish.manage.v1 publish.video.v1 setup.v1"

# 1) Binary present and responsive?
if ! command -v tinycloud >/dev/null 2>&1; then
  echo "preflight: tinycloud not installed — run: ${INSTALL_CMD}"
  exit 10
fi

# </dev/null matters: pre-0.3.0 binaries open an interactive TUI on this
# invocation and would otherwise hang waiting for input.
VERSION_JSON="$(tinycloud --version --json </dev/null 2>/dev/null)" || VERSION_JSON=""
if [ -z "$VERSION_JSON" ]; then
  echo "preflight: tinycloud found but 'tinycloud --version --json' failed — reinstall: ${INSTALL_CMD}"
  exit 10
fi

# 2) Version >= minimum?
VERSION="$(printf '%s' "$VERSION_JSON" | sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p')"
if [ -z "$VERSION" ]; then
  echo "preflight: tinycloud did not report machine-readable version info (older than ${MIN_VERSION}?) — upgrade: ${INSTALL_CMD}"
  exit 11
fi
LOWEST="$(printf '%s\n%s\n' "$VERSION" "$MIN_VERSION" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)"
if [ "$LOWEST" != "$MIN_VERSION" ]; then
  echo "preflight: tinycloud ${VERSION} is below required ${MIN_VERSION} — upgrade: ${INSTALL_CMD}"
  exit 11
fi

# Upper bound of the skill's supported_range: version must be < MAX_VERSION_EXCLUSIVE
LOWEST_MAX="$(printf '%s\n%s\n' "$VERSION" "$MAX_VERSION_EXCLUSIVE" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)"
if [ "$VERSION" = "$MAX_VERSION_EXCLUSIVE" ] || [ "$LOWEST_MAX" != "$VERSION" ]; then
  echo "preflight: tinycloud ${VERSION} is newer than this skill supports (< ${MAX_VERSION_EXCLUSIVE}) — update the skill: npx @cloudglue/tinycloud skills install --force"
  exit 11
fi

# 3) Required feature ids present? (feature ids are quoted JSON strings, so
#    substring matching against the raw JSON is safe)
MISSING=""
for f in $REQUIRED_FEATURES; do
  case "$VERSION_JSON" in
    *"\"$f\""*) : ;;
    *) MISSING="${MISSING}${MISSING:+,}$f" ;;
  esac
done
if [ -n "$MISSING" ]; then
  echo "preflight: tinycloud ${VERSION} lacks required features [${MISSING}] — upgrade: ${INSTALL_CMD}"
  exit 12
fi

# 4) Credentials? setup --check --json reports data.ok (no-space JSON output;
#    keep the spaced variant as belt-and-braces)
CHECK_JSON="$(tinycloud setup --check --json </dev/null 2>/dev/null)" || CHECK_JSON=""
case "$CHECK_JSON" in
  *'"ok":true'*|*'"ok": true'*)
    echo "preflight: ok — tinycloud ${VERSION} ready (all features + credentials present)"
    exit 0
    ;;
  *)
    echo "preflight: tinycloud ${VERSION} installed but Cloudglue credentials missing — run: tinycloud setup cloudglue --api-key <key>  (or export CLOUDGLUE_API_KEY=...)"
    exit 13
    ;;
esac
