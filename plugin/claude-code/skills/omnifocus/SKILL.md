# OmniFocus CLI Skill

Use the `omnifocus` CLI to read and write OmniFocus data. Always use `--json` for structured output.

## Invocation

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json <command> [options]
```

## JSON Envelope

All `--json` responses use a consistent envelope:

```json
{"status": "ok", "data": ...}
{"status": "error", "error": {"code": "...", "message": "..."}}
```

## Commands

### List tasks

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks --project "Work"
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks --tag "urgent"
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks --flagged
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks --completed
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tasks --only-completed
```

Returns array of task objects with fields: `id`, `name`, `note`, `flagged`, `completed`, `defer_date`, `due_date`, `project`, `tags`.

### List projects

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json projects
```

Returns array of project objects with fields: `id`, `name`, `note`, `status`, `folder`, `due_date`, `completion_date`, `tags`.

### List tags

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json tags
```

Returns array of tag objects with fields: `id`, `name`, `parent_tag`, `child_tags`.

### List folders

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json folders
```

Returns array of folder objects with fields: `id`, `name`, `parent_folder`, `projects`, `subfolders`.

### Create a task

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json create-task "Buy groceries"
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json create-task "File taxes" --project "Finance" --tag "urgent" --flagged --due "2026-04-15" --defer "2026-04-01" --note "Use TurboTax"
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json create-task "Test" --dry-run
```

Options: `--note`, `--project`, `--tag`, `--flagged`, `--due`, `--defer`, `--dry-run`.

Returns `{id, name, created: true}`.

### Complete a task

```bash
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json complete "TASK_ID"
${CLAUDE_PLUGIN_ROOT}/bin/run omnifocus --json complete "TASK_ID" --dry-run
```

Returns `{id, name, completed: true}`.

## Tips

- Use `--dry-run` on write commands to preview without side effects.
- Task IDs are OmniFocus internal IDs (opaque strings). Get them from `tasks` output.
- The `--tag` filter on `tasks` matches by tag name.
- `--completed` shows both complete and incomplete; `--only-completed` shows only completed.
- Default `tasks` output is incomplete tasks only.
