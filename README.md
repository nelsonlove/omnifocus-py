# omnifocus-py

Python library, CLI, and MCP server for OmniFocus on macOS.

## Features

- Full CRUD for tasks: list, create, complete, delete
- List and create projects with folder and tag assignment
- List tags and folders with hierarchy
- Tag/untag projects and tasks
- Open projects in OmniFocus
- Optional MCP server for AI tool integration
- Structured JSON output with `--json`
- `--dry-run` on all write operations
- All interaction via JXA (JavaScript for Automation)

## Installation

```bash
pip install omnifocus-py  # or: pipx install omnifocus-py
pip install 'omnifocus-py[mcp]'  # for MCP server
```

Requires macOS with OmniFocus 3 or 4 running. Python 3.10+.

## CLI

```bash
omnifocus --help
omnifocus tasks
omnifocus tasks --project "Work" --tag "urgent" --flagged
omnifocus tasks --completed
omnifocus projects
omnifocus tags
omnifocus folders
omnifocus create-task "Buy groceries" --project "Errands" --tag "@errands" --due 2026-03-20
omnifocus complete <task-id>
omnifocus --json tasks
```

## Python API

```python
from omnifocus import OmniFocusClient

client = OmniFocusClient()
tasks = client.get_tasks(project="Work", flagged=True)
projects = client.get_projects()
tags = client.get_contexts()
folders = client.get_folders()
client.create_task("Buy groceries", project="Errands", context="@errands")
client.create_project("New Project", folder="Work", tags=["priority"])
client.complete_task(task_id)
client.tag_task(task_id, "urgent")
client.untag_task(task_id, "old-tag")
client.tag_project("My Project", "JD:26")
```

## MCP Server

The MCP server exposes OmniFocusClient methods as tools for AI assistants.

```bash
pip install 'omnifocus-py[mcp]'
```

Configure in Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "omnifocus-mcp"
    }
  }
}
```

## Development

```bash
git clone https://github.com/nelsonlove/omnifocus-py.git
cd omnifocus-py
uv sync --extra mcp --extra dev
uv run pytest
uv run omnifocus --help
```

## License

MIT
