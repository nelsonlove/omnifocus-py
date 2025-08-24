# OmniFocus MCP Server

An MCP (Model Context Protocol) server that provides integration with OmniFocus on macOS, allowing Claude and other MCP clients to interact with your OmniFocus tasks and projects.

## Features

- **Get Tasks**: Retrieve tasks with filters (project, context, flagged status)
- **Get Projects**: List all projects
- **Get Contexts**: List all contexts/tags
- **Create Tasks**: Add new tasks with properties like notes, due dates, and flags
- **Update Tasks**: Modify existing tasks
- **Complete Tasks**: Mark tasks as completed
- **Delete Tasks**: Remove tasks from OmniFocus

## Prerequisites

- macOS with OmniFocus 3 or 4 installed
- Node.js 18 or higher
- OmniFocus must be running when using the MCP server

## Installation

1. Clone or download this repository
2. Navigate to the project directory:
   ```bash
   cd omnifocus-mcp
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Configuration for Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "omnifocus": {
      "command": "node",
      "args": ["/path/to/omnifocus-mcp/src/index.js"]
    }
  }
}
```

Replace `/path/to/omnifocus-mcp` with the actual path to this project directory.

## Usage

Once configured, Claude will have access to the following tools:

### get_tasks
Retrieve tasks from OmniFocus with optional filters:
- `project`: Filter by project name
- `context`: Filter by context/tag
- `flagged`: Filter by flagged status
- `completed`: Include completed tasks

### get_projects
Get a list of all projects in OmniFocus.

### get_contexts
Get a list of all contexts/tags in OmniFocus.

### create_task
Create a new task with:
- `name` (required): Task name
- `note`: Task description
- `project`: Project to add task to
- `context`: Context/tag to assign
- `flagged`: Whether to flag the task
- `dueDate`: Due date in ISO format

### update_task
Update an existing task:
- `taskId` (required): ID of the task to update
- `name`: New task name
- `note`: New task note
- `flagged`: New flagged status
- `dueDate`: New due date

### complete_task
Mark a task as completed:
- `taskId` (required): ID of the task to complete

### delete_task
Delete a task:
- `taskId` (required): ID of the task to delete

## Example Interactions

Here are some example prompts you can use with Claude once the MCP server is configured:

- "Show me all my flagged tasks in OmniFocus"
- "Create a new task 'Review quarterly reports' in the Work project with a due date of tomorrow"
- "What projects do I have in OmniFocus?"
- "Mark task [taskId] as completed"
- "Update the task [taskId] to be flagged and due next Monday"

## Troubleshooting

### Permission Issues
If you encounter permission errors, you may need to grant Terminal or your terminal application access to control OmniFocus in System Preferences > Security & Privacy > Privacy > Automation.

### OmniFocus Not Responding
Ensure OmniFocus is running when using the MCP server. The server communicates with OmniFocus through AppleScript/JXA, which requires the application to be active.

### Task IDs
Task IDs are OmniFocus's internal identifiers. You can find them by first using `get_tasks` to list tasks, which will include the ID for each task.

## Development

The server uses JavaScript for Automation (JXA) to communicate with OmniFocus. The main components are:

- `src/index.js`: MCP server implementation
- `src/omnifocus.js`: OmniFocus automation client using JXA

To test the server locally:
```bash
npm start
```

## License

MIT