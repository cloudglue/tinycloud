#!/bin/bash
# Install Tinycloud
#
# Usage:
#   curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
#   curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- --version 0.3.0
#   curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- --channel beta
#
# Environment:
#   TINYCLOUD_INSTALL_DIR       target bin dir (default: ~/.tinycloud/bin)
#   TINYCLOUD_VERSION           version to install (same as --version)
#   TINYCLOUD_DIST_URL          distribution base URL override
#   TINYCLOUD_REQUIRE_MANIFEST  =1: fail if the release manifest is missing
#   TINYCLOUD_OS/TINYCLOUD_ARCH platform detection overrides (testing)

set -euo pipefail

BASE_URL="${TINYCLOUD_DIST_URL:-https://media.cloudglue.dev/tinycloud-dist}"
BASE_URL="${BASE_URL%/}"
INSTALL_DIR="${TINYCLOUD_INSTALL_DIR:-$HOME/.tinycloud/bin}"
VERSION="${TINYCLOUD_VERSION:-}"
CHANNEL="stable"
PRINT_URL=0

usage() {
  cat <<'EOF'
Install Tinycloud.

Options:
  --version <semver>   Install a specific version (default: latest)
  --channel <name>     Release channel: stable | beta (default: stable)
  --install-dir <dir>  Target bin directory (default: ~/.tinycloud/bin)
  --print-url          Print the resolved download URL and exit
  -h, --help           Show this help
EOF
}

# require_value FLAG VALUE — flag values must not be another option
require_value() {
  if [ -z "${2:-}" ] || [ "${2#-}" != "$2" ]; then
    echo "Error: $1 requires a value (got: ${2:-<nothing>})" >&2
    exit 1
  fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)   require_value "$1" "${2:-}"; VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    --channel)   require_value "$1" "${2:-}"; CHANNEL="$2"; shift 2 ;;
    --channel=*) CHANNEL="${1#*=}"; shift ;;
    --install-dir)   require_value "$1" "${2:-}"; INSTALL_DIR="$2"; shift 2 ;;
    --install-dir=*) INSTALL_DIR="${1#*=}"; shift ;;
    --print-url) PRINT_URL=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    --*)
      echo "Error: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      # Back-compat: positional version (`bash install.sh 0.3.0`)
      VERSION="$1"; shift ;;
  esac
done

# Accept a leading v (v0.3.0 == 0.3.0); "latest" means the default behavior
VERSION="${VERSION#v}"
[ "$VERSION" = "latest" ] && VERSION=""

# Version strings end up in URLs and file paths — reject anything that isn't
# a plain version token (same rule as the npm launcher's normalizeVersion).
validate_version() {
  case "$1" in
    "") return 0 ;;
    [0-9A-Za-z]*) ;;
    *) echo "Error: invalid version \"$1\" (expected a version like 0.3.0)" >&2; exit 1 ;;
  esac
  case "$1" in
    *[!0-9A-Za-z.+_-]*) echo "Error: invalid version \"$1\" (expected a version like 0.3.0)" >&2; exit 1 ;;
  esac
}
validate_version "$VERSION"

case "$CHANNEL" in
  stable|beta) ;;
  *) echo "Error: Unknown channel: $CHANNEL (expected stable | beta)" >&2; exit 1 ;;
esac

# Detect platform
OS="${TINYCLOUD_OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${TINYCLOUD_ARCH:-$(uname -m)}"

case "$OS" in
  darwin) PLATFORM_OS="darwin" ;;
  linux)  PLATFORM_OS="linux" ;;
  *)
    echo "Error: Unsupported OS: $OS (supported: darwin, linux; on Windows use WSL2)" >&2
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH (supported: x64, arm64)" >&2
    exit 1
    ;;
esac

PLATFORM="${PLATFORM_OS}-${PLATFORM_ARCH}"

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

# --- Resolve version + URL + checksum -----------------------------------
# Try the release manifest first; fall back to direct tarball names when it
# has not been published. A checksum MISMATCH always fails; a MISSING
# checksum only fails when TINYCLOUD_REQUIRE_MANIFEST=1.

MANIFEST_FILE="${TMP_DIR}/manifest.json"
HAVE_MANIFEST=0
# The manifest is an optimization, never a requirement (unless strict mode):
# installs that don't need it must survive manifest-endpoint problems. Any
# non-200 (CloudFront 403-for-missing, 404, 5xx, network failure) degrades to
# the direct-URL + sidecar path; checksum MISMATCHES still always fail.
# (`|| true` guards set -e; curl -w prints 000 itself on network failure.)
HTTP_CODE="$(curl -sSL -o "$MANIFEST_FILE" -w '%{http_code}' "${BASE_URL}/manifest.json" 2>/dev/null || true)"
HTTP_CODE="${HTTP_CODE:-000}"
case "$HTTP_CODE" in
  200) HAVE_MANIFEST=1 ;;
  000|403|404) HAVE_MANIFEST=0 ;;
  *)
    echo "Warning: fetching ${BASE_URL}/manifest.json failed (HTTP ${HTTP_CODE}); proceeding without it" >&2
    HAVE_MANIFEST=0
    ;;
esac

if [ "$HAVE_MANIFEST" -eq 0 ] && [ "${TINYCLOUD_REQUIRE_MANIFEST:-0}" = "1" ]; then
  echo "Error: TINYCLOUD_REQUIRE_MANIFEST=1 but ${BASE_URL}/manifest.json is unavailable (HTTP ${HTTP_CODE})" >&2
  exit 1
fi

HAVE_PY3=0
command -v python3 >/dev/null 2>&1 && HAVE_PY3=1

# json_get FILE KEY... (each KEY is one object level; keys may contain dots,
# e.g. json_get m.json versions 0.3.0 platforms darwin-arm64 url). Requires
# python3 — callers must check HAVE_PY3 (a flat sed fallback could match a
# field from the wrong platform/version block).
json_get() {
  local file="$1"
  shift
  python3 - "$file" "$@" <<'PYEOF'
import json, sys
obj = json.load(open(sys.argv[1]))
for key in sys.argv[2:]:
    if not isinstance(obj, dict) or key not in obj:
        sys.exit(1)
    obj = obj[key]
if obj is None:
    sys.exit(1)  # null behaves like a missing key, never the string "None"
print(obj if not isinstance(obj, (dict, list)) else json.dumps(obj))
PYEOF
}

# channel_version CHANNEL — sed scoped to the small flat "channels" object,
# safe without python3.
channel_version() {
  sed -n '/"channels"/,/}/p' "$MANIFEST_FILE" \
    | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
}

if [ "$HAVE_MANIFEST" -eq 1 ]; then
  # An unusable body (captive-portal HTML, truncated JSON, future schema)
  # degrades like a missing manifest — the sidecar path still verifies
  # checksums, and checksum mismatches always fail. Strict mode keeps it a
  # hard error.
  SCHEMA="$(grep -o '"schema"[[:space:]]*:[[:space:]]*[0-9][0-9]*' "$MANIFEST_FILE" | grep -o '[0-9][0-9]*$' | head -1)"
  if [ "${SCHEMA:-}" != "1" ]; then
    echo "Warning: ${BASE_URL}/manifest.json is not a usable release manifest (schema '${SCHEMA:-?}'); proceeding without it" >&2
    HAVE_MANIFEST=0
  elif command -v python3 >/dev/null 2>&1 && ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$MANIFEST_FILE" 2>/dev/null; then
    # A schema marker can survive truncation; reject bodies that don't parse
    echo "Warning: ${BASE_URL}/manifest.json is not valid JSON; proceeding without it" >&2
    HAVE_MANIFEST=0
  fi
  if [ "$HAVE_MANIFEST" -eq 0 ] && [ "${TINYCLOUD_REQUIRE_MANIFEST:-0}" = "1" ]; then
    echo "Error: TINYCLOUD_REQUIRE_MANIFEST=1 but the manifest is unusable" >&2
    exit 1
  fi
fi

EXPECTED_SHA256=""
if [ "$HAVE_MANIFEST" -eq 1 ] && [ "$HAVE_PY3" -eq 1 ]; then
  USER_PINNED=0
  [ -n "$VERSION" ] && USER_PINNED=1
  if [ -z "$VERSION" ]; then
    VERSION="$(json_get "$MANIFEST_FILE" channels "$CHANNEL" || true)"
    if [ -z "$VERSION" ]; then
      echo "Error: Channel '${CHANNEL}' has no released version in the manifest" >&2
      exit 1
    fi
    # Manifest-resolved versions get the same v-normalization as user input
    VERSION="${VERSION#v}"; validate_version "$VERSION"
  fi
  URL="$(json_get "$MANIFEST_FILE" versions "$VERSION" platforms "$PLATFORM" url || true)"
  EXPECTED_SHA256="$(json_get "$MANIFEST_FILE" versions "$VERSION" platforms "$PLATFORM" sha256 || true)"
  if [ -n "$URL" ] && [ -n "${TINYCLOUD_DIST_URL:-}" ]; then
    # An explicit distribution base (mirror, fixture) wins over the
    # manifest's absolute URLs — otherwise the override only redirects the
    # manifest fetch while tarballs still download from the canonical CDN.
    URL="${BASE_URL}/$(basename "$URL")"
  fi
  if [ -z "$URL" ] && [ "$USER_PINNED" -eq 1 ] && [ "${TINYCLOUD_REQUIRE_MANIFEST:-0}" != "1" ]; then
    # A user-pinned version missing from the manifest (e.g. a pre-manifest
    # release whose tarball is still on the CDN) falls back to the
    # conventional URL + sidecar instead of hard-failing.
    echo "Warning: version ${VERSION} is not in the release manifest; trying the direct URL" >&2
    URL="${BASE_URL}/tinycloud-${PLATFORM}-v${VERSION}.tar.gz"
    EXPECTED_SHA256="$(curl -fsSL "${URL}.sha256" 2>/dev/null | grep -oE '^[0-9a-fA-F]{64}' | head -1 || true)"
  elif [ -z "$URL" ]; then
    echo "Error: Version ${VERSION} for ${PLATFORM} not found in the release manifest" >&2
    exit 1
  fi
  TARBALL="$(basename "$URL")"
elif [ "$HAVE_MANIFEST" -eq 1 ]; then
  # No python3: resolve only the channel from the manifest (flat block, safe
  # with sed), then rely on the pinned naming convention + per-tarball
  # sidecar for integrity. Never sed nested platform fields — on a
  # multi-platform manifest that can return the wrong platform's checksum.
  if [ -z "$VERSION" ]; then
    VERSION="$(channel_version "$CHANNEL")"
    if [ -z "$VERSION" ] || [ "$VERSION" = "null" ]; then
      echo "Error: Channel '${CHANNEL}' has no released version in the manifest" >&2
      exit 1
    fi
    # Manifest-resolved versions get the same v-normalization as user input
    VERSION="${VERSION#v}"; validate_version "$VERSION"
  fi
  TARBALL="tinycloud-${PLATFORM}-v${VERSION}.tar.gz"
  URL="${BASE_URL}/${TARBALL}"
  EXPECTED_SHA256="$(curl -fsSL "${URL}.sha256" 2>/dev/null | grep -oE '^[0-9a-fA-F]{64}' | head -1 || true)"
else
  if [ "$CHANNEL" != "stable" ]; then
    echo "Error: --channel ${CHANNEL} requires the release manifest, which is not available" >&2
    exit 1
  fi
  if [ -n "$VERSION" ]; then
    TARBALL="tinycloud-${PLATFORM}-v${VERSION}.tar.gz"
  else
    TARBALL="tinycloud-${PLATFORM}.tar.gz"
  fi
  URL="${BASE_URL}/${TARBALL}"
  # Best effort: per-tarball sha256 sidecar
  EXPECTED_SHA256="$(curl -fsSL "${URL}.sha256" 2>/dev/null | grep -oE '^[0-9a-fA-F]{64}' | head -1 || true)"
fi

if [ "$PRINT_URL" -eq 1 ]; then
  echo "$URL"
  exit 0
fi

if [ -n "$VERSION" ]; then
  echo "Installing Tinycloud ${VERSION} for ${PLATFORM}..."
else
  echo "Installing Tinycloud (latest) for ${PLATFORM}..."
fi
echo "Downloading ${URL}..."

if ! curl -fsSL -o "${TMP_DIR}/${TARBALL}" "$URL"; then
  echo "Error: Download failed: ${URL}" >&2
  if [ -n "$VERSION" ]; then
    echo "Hint: version ${VERSION} may not be published for ${PLATFORM}." >&2
  fi
  exit 1
fi

# --- Verify checksum ------------------------------------------------------
if [ -n "$EXPECTED_SHA256" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256="$(sha256sum "${TMP_DIR}/${TARBALL}" | cut -d' ' -f1)"
  else
    ACTUAL_SHA256="$(shasum -a 256 "${TMP_DIR}/${TARBALL}" | cut -d' ' -f1)"
  fi
  if [ "$(echo "$ACTUAL_SHA256" | tr '[:upper:]' '[:lower:]')" != "$(echo "$EXPECTED_SHA256" | tr '[:upper:]' '[:lower:]')" ]; then
    echo "Error: Checksum mismatch for ${TARBALL}" >&2
    echo "  expected ${EXPECTED_SHA256}" >&2
    echo "  actual   ${ACTUAL_SHA256}" >&2
    echo "Refusing to install. Retry, or report to Cloudglue if it persists." >&2
    exit 1
  fi
  echo "Checksum verified."
elif [ "${TINYCLOUD_REQUIRE_MANIFEST:-0}" = "1" ]; then
  # Strict mode means verified-or-fail — not just manifest-present. This
  # covers e.g. the no-python3 path when the .sha256 sidecar is missing.
  echo "Error: TINYCLOUD_REQUIRE_MANIFEST=1 but no checksum is available for ${TARBALL}" >&2
  exit 1
else
  echo "Warning: no checksum available for ${TARBALL}; proceeding without verification." >&2
fi

# --- Install --------------------------------------------------------------
echo "Extracting to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"

# Remove stale distribution assets so upgrades never leave ghost files behind
# (e.g. a skill directory the new version dropped).
#
# Preferred mechanism — manifest of members: each install records the exact
# tarball member list in .tinycloud-files; the next install deletes exactly
# those paths (then prunes the emptied recorded dirs). Self-describing, no
# name allowlist to drift when future releases add new entries, and user
# files anywhere (even inside skills/ or bin/) are never touched.
RECORD_FILE="${INSTALL_DIR:?}/.tinycloud-files"
if [ -f "$RECORD_FILE" ]; then
  while IFS= read -r rel; do
    rel="${rel#./}"; rel="${rel%/}"
    [ -n "$rel" ] || continue
    case "$rel" in *..*) continue ;; esac # defensive: never traverse upward
    p="${INSTALL_DIR:?}/${rel}"
    if [ -f "$p" ] || [ -L "$p" ]; then rm -f "$p"; fi
  done < "$RECORD_FILE"
  # prune recorded directories deepest-first, only when emptied
  sort -r "$RECORD_FILE" | while IFS= read -r rel; do
    rel="${rel#./}"; rel="${rel%/}"
    [ -n "$rel" ] || continue
    case "$rel" in *..*) continue ;; esac
    # rmdir only when emptied; non-empty (user files remain) is fine
    rmdir "${INSTALL_DIR:?}/${rel}" 2>/dev/null || true
  done
  rm -f "$RECORD_FILE"
else
  # Legacy fallback (first upgrade over a pre-record install): name-based
  # cleanup, only in a clearly dedicated tinycloud dir — every entry must be
  # a distribution name AND the tinycloud binary must prove a prior install.
  # Dotfiles and npm-launcher artifacts (versions/, tmp/, wrapper-version —
  # present when TINYCLOUD_INSTALL_DIR points both tools at one dir) are
  # neutral: they don't block cleanup and are never touched.
  DEDICATED=1
  HAS_ENTRIES=0
  for entry in "${INSTALL_DIR:?}"/* "${INSTALL_DIR:?}"/.*; do
    name="$(basename "$entry")"
    [ -e "$entry" ] || continue
    case "$name" in
      .*|versions|tmp|wrapper-version) ;;
      tinycloud|LICENSE.md|THIRD_PARTY_NOTICES.md)
        HAS_ENTRIES=1
        [ -d "$entry" ] && { DEDICATED=0; break; }
        ;;
      bin|skills|workflows|licenses)
        HAS_ENTRIES=1
        [ -d "$entry" ] || { DEDICATED=0; break; }
        ;;
      *) DEDICATED=0; break ;;
    esac
  done
  if [ "$HAS_ENTRIES" -eq 1 ] && [ ! -f "${INSTALL_DIR}/tinycloud" ]; then
    DEDICATED=0
  fi
  if [ "$DEDICATED" -eq 1 ]; then
    rm -f "${INSTALL_DIR:?}/tinycloud" "${INSTALL_DIR:?}/LICENSE.md" \
          "${INSTALL_DIR:?}/THIRD_PARTY_NOTICES.md"
    # skills/ may hold user-authored skills: remove only the names the
    # pre-record distributions actually bundled, never the whole tree.
    for s in sales-coaching blog-post ad-analysis meeting-breakdown \
             youtube-publish media-artifact skill-creator; do
      rm -rf "${INSTALL_DIR:?}/skills/${s}"
    done
    rmdir "${INSTALL_DIR:?}/skills" 2>/dev/null || true
    rm -rf "${INSTALL_DIR:?}/workflows" "${INSTALL_DIR:?}/licenses"
    rm -f "${INSTALL_DIR:?}/bin/bun" "${INSTALL_DIR:?}/bin/ffmpeg" "${INSTALL_DIR:?}/bin/ffprobe"
  elif [ "$HAS_ENTRIES" -eq 1 ]; then
    echo "Warning: ${INSTALL_DIR} contains files that are not part of a tinycloud" >&2
    echo "install; skipping stale-asset cleanup (files from older tinycloud" >&2
    echo "versions may remain). A dedicated directory is recommended." >&2
  fi
fi
tar -xzf "${TMP_DIR}/${TARBALL}" -C "$INSTALL_DIR"
# Record this install's members for the next upgrade's exact cleanup. Write
# atomically: a failed listing must not leave an empty record behind (an
# empty record would make every future cleanup a no-op and block the legacy
# fallback too).
if tar -tzf "${TMP_DIR}/${TARBALL}" > "${RECORD_FILE}.tmp" 2>/dev/null && [ -s "${RECORD_FILE}.tmp" ]; then
  mv "${RECORD_FILE}.tmp" "$RECORD_FILE"
else
  rm -f "${RECORD_FILE}.tmp" "$RECORD_FILE"
fi

if [ -x "${INSTALL_DIR}/tinycloud" ]; then
  echo ""
  echo "Tinycloud installed successfully!"
  echo "Binary: ${INSTALL_DIR}/tinycloud"

  # Ensure shell RC file has PATH configured
  SHELL_NAME=$(basename "${SHELL:-unknown}")
  RC_FILE=""
  EXPORT_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
  FISH_LINE="fish_add_path ${INSTALL_DIR}"
  case "$SHELL_NAME" in
    zsh)  RC_FILE="$HOME/.zshrc" ;;
    bash) RC_FILE="$HOME/.bashrc" ;;
    fish) RC_FILE="$HOME/.config/fish/config.fish" ;;
  esac

  # The install dir gets embedded in shell rc lines that every future shell
  # sources — never write a path whose characters could escape the quoting
  # and execute as code. Spaces and ordinary path characters are fine.
  case "$INSTALL_DIR" in
    *[\"\'\`\$\;\&\|\<\>\(\)\\]*|*'
'*)
      echo "Note: the install directory contains shell metacharacters; not" >&2
      echo "editing ${RC_FILE:-your shell rc}. Add it to PATH yourself." >&2
      RC_FILE=""
      ;;
  esac

  if [ -n "$RC_FILE" ]; then
    # Idempotent: only append if not already present
    if [ -f "$RC_FILE" ] && grep -v '^\s*#' "$RC_FILE" 2>/dev/null | grep -qF "$INSTALL_DIR"; then
      echo "PATH already configured in ${RC_FILE}:"
      echo "  $(grep -v '^\s*#' "$RC_FILE" | grep -F "$INSTALL_DIR" | head -1)"
    else
      if [ "$SHELL_NAME" = "fish" ]; then
        mkdir -p "$(dirname "$RC_FILE")"
        echo "" >> "$RC_FILE"
        echo "$FISH_LINE" >> "$RC_FILE"
        echo "Added to ${RC_FILE}:"
        echo "  ${FISH_LINE}"
      else
        echo "" >> "$RC_FILE"
        echo "$EXPORT_LINE" >> "$RC_FILE"
        echo "Added to ${RC_FILE}:"
        echo "  ${EXPORT_LINE}"
      fi
    fi
  fi

  echo ""
  case ":${PATH}:" in
    *":${INSTALL_DIR}:"*)
      echo "Run 'tinycloud' to get started."
      ;;
    *)
      if [ -n "$RC_FILE" ]; then
        echo "To use tinycloud now, run:"
        echo "  source ${RC_FILE}"
        echo ""
        echo "Or start a new terminal, then run 'tinycloud' to get started"
      else
        echo "Add to your PATH:"
        echo "  ${EXPORT_LINE}"
        echo ""
        echo "Then run 'tinycloud' to get started."
      fi
      ;;
  esac
else
  echo "Error: Installation failed"
  exit 1
fi
