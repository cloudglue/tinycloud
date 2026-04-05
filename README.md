# tinycloud

Minimal agentic CLI for working with video files and code. Powered by [Cloudglue](https://cloudglue.dev).

## Install

### npm

```bash
npm install -g @cloudglue/tinycloud
```

Install a specific version:

```bash
npm install -g @cloudglue/tinycloud@0.1.7
```

### curl

```bash
curl -fsSL https://media.cloudglue.dev/tinycloud-dist/install.sh | bash
```

Install a specific version:

```bash
curl -fsSL https://media.cloudglue.dev/tinycloud-dist/install.sh | bash -s -- v0.1.7
```

## Usage

```bash
tinycloud                                      # Interactive mode
tinycloud "describe this video" --read video.mp4  # One-shot mode
```

## Features

- Agentic video analysis — describe, extract structured data, search across videos
- Built-in ffmpeg tools — transcode, split, stitch, extract audio, burn captions
- Skills system — extensible with built-in and custom skills
- Collection search — semantic search and Q&A over video collections
- Data connectors — Dropbox, Google Drive, S3, Zoom, Gong, and more
- Session management — persistent conversations with context compaction

## Documentation

- [Cloudglue Documentation](https://docs.cloudglue.dev)
- [Cloudglue Dashboard](https://app.cloudglue.dev)

## Supported Platforms

| Platform | npm package | curl |
|---|---|---|
| macOS (Apple Silicon) | `@cloudglue/tinycloud-darwin-arm64` | `tinycloud-darwin-arm64.tar.gz` |
| macOS (Intel) | `@cloudglue/tinycloud-darwin-x64` | `tinycloud-darwin-x64.tar.gz` |
| Linux (x64) | `@cloudglue/tinycloud-linux-x64` | `tinycloud-linux-x64.tar.gz` |
| Linux (ARM64) | `@cloudglue/tinycloud-linux-arm64` | `tinycloud-linux-arm64.tar.gz` |

## License

© Aviary Inc. All rights reserved. Use is subject to [Aviary Inc Terms of Service](https://cloudglue.dev/terms).
