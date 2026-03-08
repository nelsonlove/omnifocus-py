# OmniFocus MCP Server Setup

## Prerequisites

- Node.js 18+
- OmniFocus installed on macOS
- Claude Desktop or Claude Code

## Installation

```bash
npm install
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/Users/nelson/repos/omnifocus-mcp/src/index.js"]
    }
  }
}
```

### Claude Code (project-level)

Add `.mcp.json` to the project root:

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/Users/nelson/repos/omnifocus-mcp/src/index.js"]
    }
  }
}
```

## Permissions

OmniFocus requires automation permissions. Grant in:
**System Settings → Privacy & Security → Automation**

## Available Tools

### Tasks
- `get_tasks` — list tasks with filters (project, context, flagged, completed)
- `get_task` — get a single task with subtasks
- `get_tasks_by_date` — filter by due today, due soon, overdue, deferred, available
- `create_task` — create a task (name, note, project, context, dueDate, deferDate, flagged)
- `update_task` — update an existing task by ID
- `complete_task` — mark a task completed
- `delete_task` — delete a task

### Projects
- `get_projects` — list all projects
- `get_project` — get a project with all tasks
- `create_project` — create a project
- `update_project` — update a project
- `complete_project` — mark a project completed
- `delete_project` — delete a project

### Contexts / Tags
- `get_contexts` — list all contexts/tags
- `create_context` — create a context/tag
- `update_context` — update a context/tag
- `delete_context` — delete a context/tag

### Folders
- `get_folders` — list all folders
- `create_folder` — create a folder
- `update_folder` — update a folder
- `delete_folder` — delete a folder
