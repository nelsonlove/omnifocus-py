# OmniFocus MCP Server Setup for Claude Desktop

## Installation

### Prerequisites
- Node.js 18+ installed
- OmniFocus installed on macOS
- Claude Desktop app

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "omnifocus-pim": {
      "command": "node",
      "args": ["/Users/nelson/Desktop/omnifocus-mcp/src/meta-server.js"],
      "env": {}
    }
  }
}
```

**Important:** Replace `/Users/nelson/Desktop/omnifocus-mcp` with the actual path to this directory on your system.

### Step 3: Restart Claude Desktop

1. Completely quit Claude Desktop (Cmd+Q on macOS, or use the system tray)
2. Relaunch Claude Desktop
3. Look for the hammer/tools icon in the bottom-right corner of the conversation input box
4. Click the icon to see available MCP tools

## Available Tools

The server provides the following tools:

### Cross-Tool Features
- `search_everywhere` - Search across all PIM tools (OmniFocus and Obsidian)
- `create_linked` - Create linked items across PIM tools

### Task Management
- `of_get_tasks` - Get tasks with advanced filtering (supports multiple contexts with AND/OR/NOT operations)
- `of_get_task` - Get a single task with all its subtasks (recursively nested)
- `of_create_task` - Create a new task (supports project, context, due date, defer date, flags)
- `of_update_task` - Update an existing task
- `of_complete_task` - Mark a task as completed
- `of_delete_task` - Delete a task
- `of_get_tasks_by_date` - Filter tasks by date criteria (due today, due soon, overdue, deferred, available)

### Project Management
- `of_get_projects` - Get all projects
- `of_get_project` - Get a single project with all its tasks (recursively nested)
- `of_create_project` - Create a new project
- `of_update_project` - Update an existing project
- `of_complete_project` - Mark a project as completed
- `of_delete_project` - Delete a project

### Context/Tag Management
- `of_get_contexts` - Get all contexts/tags with parent hierarchy
- `of_create_context` - Create a new context/tag
- `of_update_context` - Update an existing context/tag
- `of_delete_context` - Delete a context/tag

### Folder Management
- `of_get_folders` - Get all folders
- `of_create_folder` - Create a new folder
- `of_update_folder` - Update an existing folder
- `of_delete_folder` - Delete a folder

### Obsidian Note Management
- `obs_search_notes` - Search notes in Obsidian
- `obs_read_note` - Read a note from Obsidian vault
- `obs_update_note` - Update or create a note in Obsidian
- `obs_global_search` - Search across entire Obsidian vault
- `obs_list_notes` - List notes in Obsidian vault
- `obs_manage_tags` - Manage tags for an Obsidian note (add/remove/list)
- `obs_search_replace` - Search and replace text in an Obsidian note
- `obs_manage_frontmatter` - Manage YAML frontmatter for an Obsidian note
- `obs_delete_note` - Delete a note from Obsidian vault

## Troubleshooting

### Server doesn't appear in Claude Desktop
1. Check that the path in claude_desktop_config.json is absolute and correct
2. Ensure Node.js is installed: `node --version`
3. Check Claude Desktop logs for errors

### Permission errors on macOS
OmniFocus requires accessibility permissions for automation. Grant permissions in:
System Preferences → Security & Privacy → Privacy → Automation

### Testing the server standalone
```bash
# Test the OmniFocus client
node test-omnifocus.js

# Test the MCP server
node test-mcp.js
```

## Development

### Running the server directly
```bash
# Run the meta-server (includes both OmniFocus and Obsidian)
node src/meta-server.js

# Run just the OmniFocus server
node src/index.js
```

### Environment Variables
Create a `.env` file if needed (see `.env.example` for template).