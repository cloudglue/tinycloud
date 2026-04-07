#!/bin/bash
# Install Tinycloud
#
# Usage:
#   curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash
#
# Install a specific version:
#   curl -fsSL https://app.cloudglue.dev/tinycloud.sh | bash -s -- v0.1.2

set -euo pipefail

VERSION="${1:-}"
BASE_URL="https://media.cloudglue.dev/tinycloud-dist"
INSTALL_DIR="${TINYCLOUD_INSTALL_DIR:-$HOME/.tinycloud/bin}"

# Detect platform
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  darwin) PLATFORM_OS="darwin" ;;
  linux)  PLATFORM_OS="linux" ;;
  *)
    echo "Error: Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

PLATFORM="${PLATFORM_OS}-${PLATFORM_ARCH}"

if [ -n "$VERSION" ]; then
  TARBALL="tinycloud-${PLATFORM}-${VERSION}.tar.gz"
  echo "Installing Tinycloud ${VERSION} for ${PLATFORM}..."
else
  TARBALL="tinycloud-${PLATFORM}.tar.gz"
  echo "Installing Tinycloud (latest) for ${PLATFORM}..."
fi

URL="${BASE_URL}/${TARBALL}"
echo "Downloading ${URL}..."

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

curl -fsSL -o "${TMP_DIR}/${TARBALL}" "$URL"

echo "Extracting to ${INSTALL_DIR}..."
mkdir -p "$INSTALL_DIR"
tar -xzf "${TMP_DIR}/${TARBALL}" -C "$INSTALL_DIR"

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
