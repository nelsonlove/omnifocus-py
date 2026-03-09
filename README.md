# OmniFocus MCP Server

A Python MCP server and library for OmniFocus on macOS. Provides full CRUD for tasks, projects, folders, and tags via JXA (JavaScript for Automation).

## Features

- **Tasks**: get, create, update, complete, delete
- **Projects**: get, create, update
- **Tags**: get, create, tag/untag projects and tasks
- **Folders**: get
- **Utility**: open project in OmniFocus

Also usable as a Python library — import `OmniFocusClient` directly.

## Prerequisites

- macOS with OmniFocus 3 or 4 installed
- Python 3.10+
- OmniFocus must be running when using the server

## Installation

```bash
pip install -e .
```

This installs the `omnifocus-mcp` command and the `omnifocus_mcp` Python package.

## Usage as MCP server

### Claude Code plugin

The `omnifocus` plugin in `claude-code-plugins` points to this server:

```json
{
  "mcpServers": {
    "omnifocus-mcp": {
      "command": "omnifocus-mcp"
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "omnifocus-mcp"
    }
  }
}
```

## Usage as Python library

```python
from omnifocus_mcp import OmniFocusClient, OmniFocusError

client = OmniFocusClient()

# Read
projects = client.get_projects()      # includes tags
tasks = client.get_tasks(flagged=True)
tags = client.get_contexts()

# Write
client.create_task("Buy groceries", project="Errands", context="@errands")
client.create_project("New Project", folder="Work", tags=["JD:64"])

# Tag operations
client.tag_project("My Project", "JD:26.15")
client.untag_project("My Project", "old-tag")
client.tag_task("task-id-here", "urgent")

# Open in OmniFocus
client.open_project("My Project")
```

This is how `jd-cli` uses omnifocus-mcp — it imports `OmniFocusClient` to power its JD-aware OmniFocus tools (`jd omnifocus scan`, `jd omnifocus validate`, etc.).

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_tasks` | Get tasks with optional filters (project, context, flagged, completed) |
| `get_projects` | Get all projects with tags, folders, status |
| `get_contexts` | Get all tags with parent/child relationships |
| `get_folders` | Get all folders with projects and subfolders |
| `create_task` | Create a task with optional project, context, dates |
| `create_project` | Create a project with optional folder, tags |
| `update_task` | Update task properties |
| `update_project` | Update project properties |
| `complete_task` | Mark a task as completed |
| `delete_task` | Delete a task |
| `create_tag` | Create a tag (idempotent) |
| `tag_project` | Add a tag to an existing project |
| `untag_project` | Remove a tag from a project |
| `tag_task` | Add a tag to an existing task |
| `untag_task` | Remove a tag from a task |
| `open_project` | Open a project in OmniFocus |

## Development

The server uses JXA (JavaScript for Automation) via `osascript` to communicate with OmniFocus. The main components are:

- `omnifocus_mcp/client.py` — `OmniFocusClient` class with all JXA logic
- `omnifocus_mcp/server.py` — FastMCP server that exposes client methods as tools

## Troubleshooting

### Permission Issues
Grant your terminal access to control OmniFocus in System Preferences > Privacy & Security > Automation.

### OmniFocus Not Responding
OmniFocus must be running. The server communicates via JXA which requires the application to be active.

## License

MIT
