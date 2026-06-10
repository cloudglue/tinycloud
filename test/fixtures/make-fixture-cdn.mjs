#!/usr/bin/env node
// Serve a local fixture of the tinycloud distribution CDN for testing.
//
// Usage:
//   node make-fixture-cdn.mjs --tarball <path.tar.gz> --version 0.3.0 \
//     [--platform darwin-arm64] [--port 0] [--corrupt] [--no-manifest]
//
// Serves:
//   /manifest.json                                (unless --no-manifest)
//   /tinycloud-<platform>.tar.gz                  (latest alias)
//   /tinycloud-<platform>-<version>.tar.gz        (pinned)
//   /tinycloud-<platform>[-<version>].tar.gz.sha256
//
// --corrupt flips a byte in the served tarball while the manifest keeps the
// hash of the original bytes, so checksum verification must fail closed.
//
// Prints `LISTENING <port>` on stdout once ready.

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
}
const has = (name) => process.argv.includes(name);

const tarballPath = arg("--tarball");
const version = arg("--version", "0.3.0");
const platform = arg(
  "--platform",
  `${process.platform}-${process.arch === "x64" ? "x64" : process.arch}`
);
const port = Number(arg("--port", "0"));
const corrupt = has("--corrupt");
const noManifest = has("--no-manifest");

if (!tarballPath || !fs.existsSync(tarballPath)) {
  console.error(`make-fixture-cdn: --tarball <path> is required (got: ${tarballPath})`);
  process.exit(1);
}

const original = fs.readFileSync(tarballPath);
const sha256 = crypto.createHash("sha256").update(original).digest("hex");

let served = original;
if (corrupt) {
  served = Buffer.from(original);
  served[Math.floor(served.length / 2)] ^= 0xff;
}

const baseUrl = () => `http://127.0.0.1:${server.address().port}`;

function manifestBody() {
  return JSON.stringify(
    {
      schema: 1,
      name: "tinycloud",
      generated_at: "2026-01-01T00:00:00Z",
      channels: { stable: version, beta: null },
      versions: {
        [version]: {
          released_at: "2026-01-01T00:00:00Z",
          channel: "stable",
          protocol_version: "1",
          platforms: {
            [platform]: {
              url: `${baseUrl()}/tinycloud-${platform}-${version}.tar.gz`,
              size: original.length,
              sha256,
            },
          },
        },
      },
    },
    null,
    2
  );
}

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const tarballRoutes = new Set([
    `/tinycloud-${platform}.tar.gz`,
    `/tinycloud-${platform}-${version}.tar.gz`,
  ]);
  if (url === "/manifest.json") {
    if (noManifest) {
      res.writeHead(403).end("Forbidden"); // mimic CloudFront missing-key behavior
    } else {
      res.writeHead(200, { "content-type": "application/json" }).end(manifestBody());
    }
  } else if (tarballRoutes.has(url)) {
    res
      .writeHead(200, { "content-type": "application/x-gzip", "content-length": served.length })
      .end(served);
  } else if (url.endsWith(".tar.gz.sha256") && tarballRoutes.has(url.slice(0, -".sha256".length))) {
    res.writeHead(200, { "content-type": "text/plain" }).end(`${sha256}  ${url.slice(1, -".sha256".length)}\n`);
  } else {
    res.writeHead(403).end("Forbidden");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`LISTENING ${server.address().port}`);
});
