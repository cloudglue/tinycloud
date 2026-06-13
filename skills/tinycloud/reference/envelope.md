# The Tinycloud envelope

Every command emits one envelope (or a JSONL stream of them) on stdout.
Envelope schema version: `"1"` (reported in `--version --json` as
`envelope_schema`). Absent fields are omitted, never `null` or `[]`.

```json
{
  "tinycloud": "1",
  "kind": "watch",
  "status": "ready",
  "result_id": "res_…",
  "source_id": "src_…",
  "ref": { "…": "reusable source reference" },
  "data": { "…": "verb-specific payload" },
  "meta": { "elapsed_ms": 1234, "requires": "cloud", "cache": { "identity": "hit" } },
  "summary": "one-line human summary",
  "next": [ { "…": "suggested follow-up commands" } ],
  "setup": { "service": "cloudglue", "env": ["CLOUDGLUE_API_KEY"], "command": "tinycloud setup cloudglue" },
  "resume": { "run_id": "…", "paused_step": "…", "resume_command": "…" },
  "error": { "code": "validation", "message": "…", "retryable": false }
}
```

| Field | Purpose |
|---|---|
| `status` | The branching field — see table below |
| `kind` | Operation kind: `watch`, `extract`, `ask`, `workflow`, `setup`, … |
| `result_id` | Stable result id for `--result-id` reuse and logs |
| `source_id` | Stable source id when the operation targets media |
| `ref` | Reusable source reference (carries `cloud_ready`, Cloudglue file/collection ids) for piping or later ops |
| `data` | Verb-specific payload |
| `meta` | `elapsed_ms`, `requires` (local\|network\|cloud\|varies), `cache` states (hit\|miss\|written\|skipped), `job_id`, `usage`, `model` |
| `summary` | One-line human summary (do not parse) |
| `next` | Suggested follow-up actions |
| `setup` | Present with `needs_credentials`: how to fix |
| `resume` | Present with `paused`: run/step info to surface to the user |
| `error` | Present with `error` status: `{code, message, retryable, detail?}` |

## Statuses and exit codes

| status | exit | invariant | what you do |
|---|---|---|---|
| `ready` | 0 | `data` usable | consume and continue |
| `pending` | 0 | `meta.job_id` set | `tinycloud jobs wait <id> --timeout 120s --json`; do NOT start downstream work |
| `paused` | 0 | `resume` present | stop; surface resume info (resume not automated in 0.3.x) |
| `needs_credentials` | 2 | `setup` present | run `setup.command` or set `setup.env` |
| `needs_upload` | 3 | — | cloud upload required (runs through the user's Cloudglue account); rerun without `--no-upload` after confirming |
| `needs_download` | 3 | — | materialize locally first (`tinycloud grab …`) |
| `error` | 1 | `error` present | stop; report `error.message`; retry only if `error.retryable` |

Batch runs exit with the worst status seen. Always branch on `status`, not
the exit code alone.

## Error codes

`missing_api_key`, `insufficient_credits`, `file_not_found`,
`file_not_ready`, `not_found`, `validation`, `needs_upload`,
`needs_download`, `visual_analysis_requires_download`, `upstream`.

`upstream` on a piped command means the upstream envelope was not `ready` —
fix the upstream failure, don't retry downstream. `upstream` from a cloud
call itself is a Cloudglue API failure; when it's a request deadline
(retryable, message names `TINYCLOUD_HTTP_TIMEOUT_MS` /
`TINYCLOUD_UPLOAD_TIMEOUT_MS`), the server may still be processing — retry
or raise the knob.

## JSON vs JSONL vs text

- On a TTY, commands default to human text. **Always pass `--json`.**
- When piped, output defaults to JSONL (one envelope per line) — this is the
  pipe protocol downstream verbs consume.
- `--pretty` emits a single JSON array instead of JSONL.
- `--view segments|findings|citations|outputs|matches` selects a data subset;
  `--format tsv` renders tabular views for shell processing.
- `--raw-output` prints the raw backend payload and disables the pipe
  protocol — only for debugging.
