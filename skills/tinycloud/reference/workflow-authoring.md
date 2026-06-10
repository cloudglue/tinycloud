# Authoring workflow recipes

Workflows are YAML/JSON DAGs over the same operation verbs as the direct CLI.
Use one when the task is a repeatable recipe with stable inputs and declared
outputs. Workflow schema version: `"1"`.

```bash
tinycloud workflow validate ./my-skill.yaml --json        # check before shipping
tinycloud workflow plan ./my-skill.yaml demo.mp4 --json   # resolve graph, no side effects, free
tinycloud workflow run ./my-skill.yaml demo.mp4 --allow-command --json
```

## Recipe shape

```yaml
name: video-report
version: 1
description: Analyze a video and render an HTML report.
permissions: [command]        # only if the recipe has command steps

inputs:
  source: { type: source, required: true }
  out: { type: path, default: "${{ run.dir }}/video-report.html" }

steps:
  - id: context
    run: watch
    with:
      source: "${{ inputs.source }}"

  - id: fields
    run: extract
    from: context            # pipe the prior envelope in
    needs: [context]         # ordering
    with:
      query: "Key topics, important moments, and takeaways."

  - id: render
    run: command
    needs: [context, fields]
    with:
      command: node
      args:
        - ./scripts/render.js
        - --describe-file
        - "${{ steps.context.file }}"
        - --extract-file
        - "${{ steps.fields.file }}"
        - --out
        - "${{ inputs.out }}"
    output: { type: file, as: html, path: "${{ inputs.out }}" }

outputs:
  html: "${{ steps.render.path }}"
```

Bind inputs from the CLI positionally for `source`, or `--param k=v` for
named values.

## Step nodes

| Node | `run` | Purpose |
|---|---|---|
| Operation | any dispatchable verb (`watch extract caption search probe ask clip grab library jobs workflow publish setup`) | Same handler as `tinycloud <verb>` |
| Command | `command` | Custom local code; cwd is the recipe directory |

Operation steps take CLI flags under `with` (long names, no dashes). Known
positional names (`query question source url input artifact action group
subcommand collection connector job id`) become positionals. For subcommands
where order matters, use an explicit `args` array:

```yaml
- id: thumbs
  run: clip
  needs: [context]
  with:
    args: [thumbs, "${{ inputs.source }}"]
    interval: 5
    out: "${{ run.dir }}/thumbs"
```

Booleans become `--flag` when true; arrays repeat the flag. Relative `schema`
and command paths resolve against the recipe directory, so a skill can bundle
SKILL.md, YAML, scripts, schemas, and templates together.

## Step fields

| Field | Purpose |
|---|---|
| `id` | Unique step id |
| `run` | Operation verb or `command` |
| `needs` | Earlier step ids that must have run (ordering) |
| `from` | Pipe a prior step envelope into this operation |
| `foreach` | Run once per item of an input/prior value (`${{ inputs.item }}`) |
| `with` | Arguments and flags |
| `output` | Declare a produced file: `{ type: file\|files\|json\|text\|refs, as: html\|code\|data\|image\|file, path: … }` |

## Interpolation

| Reference | Meaning |
|---|---|
| `${{ inputs.source }}` | Top-level input |
| `${{ inputs.item }}` | Current `foreach` item |
| `${{ run.id }}` / `${{ run.dir }}` | Run id / run directory |
| `${{ steps.<id>.file }}` | Materialized JSON output path of a verb step (alias `path`) |
| `${{ steps.<id>.result_id }}` / `source_id` / `status` / `ref` / `data` | Prior step envelope fields |
| `${{ steps.<id>.describe_raw }}` | Raw describe JSON path for a `watch` step |

A value that is exactly one expression keeps its type; embedded expressions
stringify.

## Command gating

- `permissions: [command]` in the recipe allows command steps for trusted
  skills.
- `--allow-command` allows them for an ad hoc run.
- `--no-command` always disables command execution.

## Outputs and run semantics

Top-level `outputs` declares machine-readable final values; per-step `output`
declares produced files. The final workflow envelope carries `data.steps`,
`data.artifacts[].path`, and `data.outputs` — report `data.outputs.<name>` to
the user. Run files live under `./tinycloud-output/runs/<run_id>/` (the
`--out` flag moves the output base).

`--background` is not inherited by steps; a step that returns `pending` or
`paused` finalizes the workflow as `partial`. `workflow status` / `resume`
are not implemented in 0.3.x — treat `partial`/`paused` as terminal.

## Installing a custom recipe as a tinycloud-agent skill

```text
~/.tinycloud/skills/my-skill/    (or .tinycloud/skills/my-skill/ project-local)
  SKILL.md
  my-skill.yaml
  scripts/render.js
  package.json                   ({"type": "module"})
```

The tinycloud agent picks it up on next start; from any shell it runs by
path: `tinycloud workflow run ~/.tinycloud/skills/my-skill/my-skill.yaml demo.mp4 --allow-command --json`.

To wrap a recipe as a skill for *this* host agent instead, see the
`tinycloud-skill-creator` skill in this repo.
