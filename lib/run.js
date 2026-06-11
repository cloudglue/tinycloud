"use strict";

const path = require("node:path");
const { spawn } = require("node:child_process");

/**
 * Exec passthrough to the real binary: inherit stdio, forward signals, and
 * preserve exit semantics (including 128+n signal death).
 */
function run(binPath, args, installDir) {
  const env = {
    ...process.env,
    PATH: `${path.join(installDir, "bin")}${path.delimiter}${process.env.PATH || ""}`,
  };
  const child = spawn(binPath, args, { stdio: "inherit", env });
  const forwarders = new Map();
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    const forward = () => {
      try {
        child.kill(sig);
      } catch {}
    };
    forwarders.set(sig, forward);
    process.on(sig, forward);
  }
  child.on("error", (err) => {
    process.stderr.write(`tinycloud: failed to launch binary: ${err.message}\n`);
    process.exit(1);
  });
  child.on("close", (code, signal) => {
    if (signal) {
      // Remove only our forwarder (not listeners owned by parent tooling),
      // then re-raise so our exit status preserves 128+n semantics.
      const forward = forwarders.get(signal);
      if (forward) process.removeListener(signal, forward);
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code == null ? 1 : code);
  });
}

module.exports = { run };
