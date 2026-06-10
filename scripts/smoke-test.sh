#!/usr/bin/env bash
# Contract smoke tests against an installed tinycloud binary.
#
# Usage:
#   TINYCLOUD_CMD=~/.tinycloud/bin/tinycloud bash scripts/smoke-test.sh
#   EXPECTED_VERSION=0.3.0 bash scripts/smoke-test.sh     # also assert version
#
# Asserts the public contract this repo's skills and wrapper depend on. Does
# not require Cloudglue credentials and never makes paid cloud calls.
set -u

TINYCLOUD_CMD="${TINYCLOUD_CMD:-tinycloud}"
SMOKE_TIMEOUT="${SMOKE_TIMEOUT:-20}"
FAILURES=0

# Portable per-command timeout (GNU timeout is absent on stock macOS).
run_with_timeout() {
  local secs="$1"
  shift
  perl -e 'alarm shift; exec @ARGV' "$secs" "$@"
}

check() {
  local label="$1" pattern="$2"
  shift 2
  [ "$1" = "--" ] && shift
  local out
  # </dev/null + timeout matter: pre-0.3.0 binaries open an interactive TUI
  # on unrecognized invocations and are slow to exit (or hang) without them.
  if ! out="$(run_with_timeout "$SMOKE_TIMEOUT" "$@" </dev/null 2>/dev/null)"; then
    echo "FAIL ${label}: command failed or timed out (${SMOKE_TIMEOUT}s): $*"
    FAILURES=$((FAILURES + 1))
    return
  fi
  case "$out" in
    *"$pattern"*) echo "OK   ${label}" ;;
    *)
      echo "FAIL ${label}: output missing '${pattern}'"
      FAILURES=$((FAILURES + 1))
      ;;
  esac
}

# Version + feature contract
check "version: protocol_version" '"protocol_version"' -- "$TINYCLOUD_CMD" --version --json
check "version: workflow.v1 feature" '"workflow.v1"' -- "$TINYCLOUD_CMD" --version --json
check "version: envelope.v1 feature" '"envelope.v1"' -- "$TINYCLOUD_CMD" --version --json

if [ -n "${EXPECTED_VERSION:-}" ]; then
  check "version: equals ${EXPECTED_VERSION}" "\"version\":\"${EXPECTED_VERSION}\"" -- "$TINYCLOUD_CMD" --version --json
fi

# setup --check must exit 0 and report capabilities even without credentials
check "setup check: capabilities" '"capabilities"' -- "$TINYCLOUD_CMD" setup --check --json
check "setup check: view" '"view":"check"' -- "$TINYCLOUD_CMD" setup --check --json

# Machine-readable command spec
check "commands: watch present" '"name":"watch"' -- "$TINYCLOUD_CMD" commands --json
check "commands: workflow present" '"name":"workflow"' -- "$TINYCLOUD_CMD" commands --json

# Workflow recipes bundled with the distribution
check "workflow list: recipes" '"recipes"' -- "$TINYCLOUD_CMD" workflow list --json
for recipe in summary sales-coaching blog-post ad-analysis meeting-breakdown youtube-publish; do
  check "workflow validate: ${recipe}" "\"recipe\":\"${recipe}\"" -- "$TINYCLOUD_CMD" workflow validate "$recipe" --json
done

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "${FAILURES} smoke test(s) failed."
  exit 1
fi
echo ""
echo "All smoke tests passed."
