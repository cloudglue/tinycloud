"use strict";

const SUPPORTED = new Set(["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"]);

class PlatformError extends Error {}

/** Resolve the current platform to a distribution target like "darwin-arm64". */
function resolveTarget(platform = process.platform, arch = process.arch) {
  if (platform === "win32") {
    throw new PlatformError(
      "Windows is not supported. Use WSL2 (https://learn.microsoft.com/windows/wsl/) and re-run inside your Linux distro."
    );
  }
  const normArch = arch === "x64" || arch === "amd64" ? "x64" : arch === "aarch64" ? "arm64" : arch;
  const key = `${platform}-${normArch}`;
  if (!SUPPORTED.has(key)) {
    throw new PlatformError(`Unsupported platform: ${key}. Supported: ${[...SUPPORTED].join(", ")}`);
  }
  return key;
}

module.exports = { resolveTarget, SUPPORTED, PlatformError };
