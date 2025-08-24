#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { OmniFocusClient } from './omnifocus.js';

const omnifocus = new OmniFocusClient();

const server = new McpServer({
  name: 'omnifocus-mcp',
  version: '1.0.0',
});

// Register get_tasks tool
server.registerTool(
  'get_tasks',
  {
    description: 'Get tasks from OmniFocus with optional filters',
    inputSchema: {
      project: z.string().optional().describe('Filter by project name'),
      context: z.string().optional().describe('Filter by context/tag name'),
      flagged: z.boolean().optional().describe('Filter by flagged status'),
      completed: z.boolean().optional().describe('Include completed tasks (default: false)')
    }
  },
  async (args = {}) => {
    try {
      const tasks = omnifocus.getTasks(args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(tasks, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register get_projects tool
server.registerTool(
  'get_projects',
  {
    description: 'Get all projects from OmniFocus',
    inputSchema: {}
  },
  async (args = {}) => {
    try {
      const projects = omnifocus.getProjects();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(projects, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register get_contexts tool
server.registerTool(
  'get_contexts',
  {
    description: 'Get all contexts/tags from OmniFocus',
    inputSchema: {}
  },
  async (args = {}) => {
    try {
      const contexts = omnifocus.getContexts();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(contexts, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register create_task tool
server.registerTool(
  'create_task',
  {
    description: 'Create a new task in OmniFocus',
    inputSchema: {
      name: z.string().describe('Task name (required)'),
      note: z.string().optional().describe('Task note/description'),
      project: z.string().optional().describe('Project name to add task to'),
      parentTaskId: z.string().optional().describe('ID of parent task to create this as a subtask'),
      context: z.string().optional().describe('Context/tag name'),
      flagged: z.boolean().optional().describe('Whether task is flagged'),
      dueDate: z.string().optional().describe('Due date in ISO format')
    }
  },
  async (args = {}) => {
    try {
      const result = omnifocus.createTask(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register create_project tool
server.registerTool(
  'create_project',
  {
    description: 'Create a new project in OmniFocus',
    inputSchema: {
      name: z.string().describe('Project name (required)'),
      note: z.string().optional().describe('Project note/description'),
      folder: z.string().optional().describe('Folder name to add project to'),
      status: z.enum(['active', 'on hold']).optional().describe('Project status'),
      dueDate: z.string().optional().describe('Due date in ISO format')
    }
  },
  async (args = {}) => {
    try {
      const result = omnifocus.createProject(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register complete_task tool
server.registerTool(
  'complete_task',
  {
    description: 'Mark a task as completed',
    inputSchema: {
      taskId: z.string().describe('The ID of the task to complete')
    }
  },
  async (args = {}) => {
    try {
      const result = omnifocus.completeTask(args.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register update_task tool
server.registerTool(
  'update_task',
  {
    description: 'Update an existing task',
    inputSchema: {
      taskId: z.string().describe('The ID of the task to update'),
      name: z.string().optional().describe('New task name'),
      note: z.string().optional().describe('New task note'),
      flagged: z.boolean().optional().describe('New flagged status'),
      dueDate: z.string().nullable().optional().describe('New due date in ISO format (or null to clear)')
    }
  },
  async (args = {}) => {
    try {
      const { taskId, ...updates } = args;
      const result = omnifocus.updateTask(taskId, updates);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register delete_task tool
server.registerTool(
  'delete_task',
  {
    description: 'Delete a task from OmniFocus',
    inputSchema: {
      taskId: z.string().describe('The ID of the task to delete')
    }
  },
  async (args = {}) => {
    try {
      const result = omnifocus.deleteTask(args.taskId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OmniFocus MCP server running...');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});