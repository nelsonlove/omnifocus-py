# omnifocus-py

Python library, CLI, and MCP server for OmniFocus on macOS.

## Architecture

```
src/
  omnifocus/         ← Pure library (no CLI dependencies)
    client.py        OmniFocusClient: unified API via JXA bridge
    models.py        Data classes: Task, Project, Tag, Folder
    server.py        FastMCP server (calls OmniFocusClient)
  omnifocus_cli/     ← CLI package (consumes omnifocus library)
    cli.py           Click CLI (calls OmniFocusClient)
plugin/
  claude-code/       ← Claude Code plugin (calls CLI --json)
```

Dependency direction: `plugin → CLI (omnifocus_cli) → Library (omnifocus) → JXA/osascript`

## Development

```bash
uv run pytest                      # run tests
uv run omnifocus --help            # run CLI
uv sync --extra mcp --extra dev    # full install into .venv
```

## CLI conventions

- `omnifocus --json <command>` for structured JSON output
- Envelope: `{"status": "ok", "data": ...}` or `{"status": "error", "error": {...}}`
- `--dry-run` on all write operations
- No interactive prompts in `--json` mode

## Key constraints

- `OmniFocusClient` is the only public API
- Read methods return data classes (`Task`, `Project`, `Tag`, `Folder`)
- All OmniFocus access goes through JXA (osascript) — no direct DB access
- MCP dependency (`mcp` package) is optional — only needed to run the server
