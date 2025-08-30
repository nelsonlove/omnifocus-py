#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { spawn } from 'child_process';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get configuration from multiple sources in order of priority:
// 1. Environment variables (for manual/development use)
// 2. DXT user_config (passed via environment by Claude Desktop)
// 3. Local config.json file (for standalone use)
// 4. Default values

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadConfig() {
  const config = {
    obsidianApiKey: null,
    obsidianApiUrl: 'http://127.0.0.1:27123',
    obsidianVaultPath: null
  };

  // Try to load from config.json if it exists
  try {
    const configPath = join(__dirname, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      Object.assign(config, fileConfig);
    }
  } catch (e) {
    // Ignore config file errors
  }

  // Override with environment variables if present
  if (process.env.OBSIDIAN_API_KEY) config.obsidianApiKey = process.env.OBSIDIAN_API_KEY;
  if (process.env.OBSIDIAN_API_URL) config.obsidianApiUrl = process.env.OBSIDIAN_API_URL;
  if (process.env.OBSIDIAN_VAULT_PATH) config.obsidianVaultPath = process.env.OBSIDIAN_VAULT_PATH;
  
  // DXT passes user config as USER_CONFIG_* environment variables
  if (process.env.USER_CONFIG_OBSIDIANVAULTPATH) {
    config.obsidianVaultPath = process.env.USER_CONFIG_OBSIDIANVAULTPATH;
  }

  return config;
}

const config = loadConfig();

// Redirect console.log to stderr to keep stdout clean for JSON-RPC
const originalConsoleLog = console.log;
console.log = (...args) => console.error(...args);

// Import our local OmniFocus client
import { OmniFocusClient } from './omnifocus.js';

class MetaPIMServer {
  constructor() {
    this.omnifocus = new OmniFocusClient();
    this.obsidianProcess = null;
    this.notesProcess = null;
  }

  // Initialize external MCP servers as child processes
  async initializeExternalServers() {
    // Note: These would need to be installed separately
    // npm install -g obsidian-mcp-server
    // Apple Notes MCP servers are available but require Python/TypeScript setup
    
    // Try to start Obsidian MCP server
    try {
      // Pass required environment variables to Obsidian MCP
      const obsidianEnv = {
        ...process.env,
        OBSIDIAN_API_KEY: config.obsidianApiKey,
        OBSIDIAN_API_URL: config.obsidianApiUrl,
        OBSIDIAN_VAULT_PATH: config.obsidianVaultPath
      };
      
      if (!config.obsidianApiKey) {
        console.error('Warning: Obsidian API key not configured');
      }
      
      this.obsidianProcess = spawn('obsidian-mcp-server', [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: obsidianEnv
      });
      
      this.obsidianProcess.on('error', (err) => {
        console.error('Obsidian MCP server not available:', err.code);
        this.obsidianProcess = null;
      });
      
      console.error('Obsidian MCP server connected');
    } catch (error) {
      console.error('Obsidian MCP server not installed');
      this.obsidianProcess = null;
    }
    
    // Try to start Apple Notes MCP server
    try {
      this.notesProcess = spawn('mcp-apple-notes', [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.notesProcess.on('error', (err) => {
        console.error('Apple Notes MCP server not available:', err.code);
        this.notesProcess = null;
      });
      
      console.error('Apple Notes MCP server connected');
    } catch (error) {
      console.error('Apple Notes MCP server not installed');
      this.notesProcess = null;
    }
  }

  // Send request to external MCP server and get response
  async callExternalMCP(process, method, params) {
    if (!process) {
      throw new Error('External MCP server not available');
    }
    
    return new Promise((resolve, reject) => {
      const request = {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Date.now()
      };
      
      const responseHandler = (data) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === request.id) {
            process.stdout.removeListener('data', responseHandler);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch (e) {
          // Continue listening if not valid JSON
        }
      };
      
      process.stdout.on('data', responseHandler);
      process.stdin.write(JSON.stringify(request) + '\n');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        process.stdout.removeListener('data', responseHandler);
        reject(new Error('External MCP timeout'));
      }, 30000);
    });
  }

  // Unified search across all tools
  async searchEverywhere(query) {
    const results = {
      tasks: [],
      notes: [],
      calendar: []
    };
    
    // Search OmniFocus
    try {
      const tasks = this.omnifocus.getTasks();
      results.tasks = tasks.filter(task => 
        task.name.toLowerCase().includes(query.toLowerCase()) ||
        (task.note && task.note.toLowerCase().includes(query.toLowerCase()))
      );
    } catch (e) {
      console.error('OmniFocus search failed:', e);
    }
    
    // Search Obsidian via external MCP
    if (this.obsidianProcess) {
      try {
        const obsidianResults = await this.callExternalMCP(
          this.obsidianProcess,
          'tools/call',
          { name: 'obsidian_global_search', arguments: { query } }
        );
        results.notes = obsidianResults;
      } catch (e) {
        console.error('Obsidian search failed:', e);
      }
    }
    
    return results;
  }

  // Create linked items across tools
  async createLinkedItem(type, data) {
    const results = {};
    
    // Create task in OmniFocus
    if (type === 'project' || type === 'task') {
      const taskData = {
        name: data.name,
        note: data.note || '',
        project: data.project,
        context: data.context,
        flagged: data.flagged,
        force: data.force || false
      };
      
      // Add reference to note if creating from note
      if (data.noteId) {
        taskData.note += `\n\nLinked to note: obsidian://open?vault=${data.vault}&file=${data.noteId}`;
      }
      
      results.task = this.omnifocus.createTask(taskData);
    }
    
    // Create note in Obsidian
    if (type === 'note' && this.obsidianProcess) {
      const noteContent = data.content || '';
      
      // Add task reference if creating from task
      if (results.task) {
        noteContent += `\n\n---\nOmniFocus Task: ${results.task.id}`;
      }
      
      results.note = await this.callExternalMCP(
        this.obsidianProcess,
        'tools/call',
        { 
          name: 'create-note',
          arguments: {
            title: data.name,
            content: noteContent,
            tags: data.tags || []
          }
        }
      );
    }
    
    return results;
  }

  cleanup() {
    if (this.obsidianProcess) {
      this.obsidianProcess.kill();
    }
    if (this.notesProcess) {
      this.notesProcess.kill();
    }
  }
}

// Create and configure the MCP server
async function main() {
  const metaPIM = new MetaPIMServer();
  await metaPIM.initializeExternalServers();
  
  const server = new McpServer({
    name: 'pim-meta-server',
    version: '1.0.0',
    description: 'Unified Personal Information Management MCP Server'
  });

  // Register unified search tool
  server.registerTool(
    'search_everywhere',
    {
      description: 'Search across all PIM tools (OmniFocus, Obsidian, Notes)',
      inputSchema: {
        query: z.string().describe('Search query')
      }
    },
    async (args) => {
      try {
        const results = await metaPIM.searchEverywhere(args.query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
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

  // Register cross-tool creation
  server.registerTool(
    'create_linked',
    {
      description: 'Create linked items across PIM tools',
      inputSchema: {
        type: z.enum(['task', 'note', 'project']).describe('Type of item to create'),
        name: z.string().describe('Item name'),
        note: z.string().optional().describe('Description/content'),
        project: z.string().optional().describe('OmniFocus project'),
        context: z.string().optional().describe('OmniFocus context/tag (required for tasks unless force=true)'),
        tags: z.array(z.string()).optional().describe('Note tags'),
        linkTo: z.string().optional().describe('ID of item to link to'),
        force: z.boolean().optional().default(false).describe('Allow creating task without context')
      }
    },
    async (args) => {
      try {
        const results = await metaPIM.createLinkedItem(args.type, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
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

  // Register all OmniFocus tools with "of_" prefix
  
  // Get tasks
  server.registerTool(
    'of_get_tasks',
    {
      description: 'Get tasks from OmniFocus with advanced filtering',
      inputSchema: {
        project: z.string().optional().describe('Filter by project'),
        context: z.string().optional().describe('Filter by single context/tag (backward compatibility)'),
        contexts: z.array(z.string()).optional().describe('Filter by multiple contexts/tags'),
        contextMode: z.enum(['any', 'all', 'none']).optional().describe('How to combine multiple contexts: any (OR), all (AND), none (NOT)'),
        flagged: z.boolean().optional().describe('Filter by flagged status'),
        completed: z.boolean().optional().describe('Include completed tasks')
      }
    },
    async (args = {}) => {
      try {
        const tasks = metaPIM.omnifocus.getTasks(args || {});
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

  // Get projects
  server.registerTool(
    'of_get_projects',
    {
      description: 'Get all projects from OmniFocus',
      inputSchema: {}
    },
    async (args = {}) => {
      try {
        const projects = metaPIM.omnifocus.getProjects();
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

  // Get single project with nested tasks
  server.registerTool(
    'of_get_project',
    {
      description: 'Get a single project with all its tasks (recursively nested)',
      inputSchema: {
        projectId: z.string().describe('The ID of the project to retrieve')
      }
    },
    async (args = {}) => {
      try {
        const project = metaPIM.omnifocus.getProject(args.projectId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(project, null, 2)
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

  // Get single task with nested subtasks
  server.registerTool(
    'of_get_task',
    {
      description: 'Get a single task with all its subtasks (recursively nested)',
      inputSchema: {
        taskId: z.string().describe('The ID of the task to retrieve')
      }
    },
    async (args = {}) => {
      try {
        const task = metaPIM.omnifocus.getTask(args.taskId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(task, null, 2)
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

  // Get contexts/tags
  server.registerTool(
    'of_get_contexts',
    {
      description: 'Get all contexts/tags from OmniFocus',
      inputSchema: {}
    },
    async (args = {}) => {
      try {
        const contexts = metaPIM.omnifocus.getContexts();
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

  // Create context/tag
  server.registerTool(
    'of_create_context',
    {
      description: 'Create a new context/tag in OmniFocus',
      inputSchema: {
        name: z.string().describe('Context/tag name (required)'),
        parentTag: z.string().optional().describe('Parent tag name')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.createContext(args);
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

  // Update context/tag
  server.registerTool(
    'of_update_context',
    {
      description: 'Update an existing context/tag',
      inputSchema: {
        contextId: z.string().describe('The ID of the context/tag to update'),
        name: z.string().optional().describe('New context/tag name')
      }
    },
    async (args = {}) => {
      try {
        const { contextId, ...updates } = args;
        const result = metaPIM.omnifocus.updateContext(contextId, updates);
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

  // Delete context/tag
  server.registerTool(
    'of_delete_context',
    {
      description: 'Delete a context/tag from OmniFocus',
      inputSchema: {
        contextId: z.string().describe('The ID of the context/tag to delete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.deleteContext(args.contextId);
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

  // Create project
  server.registerTool(
    'of_create_project',
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
        const result = metaPIM.omnifocus.createProject(args);
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

  // Update project
  server.registerTool(
    'of_update_project',
    {
      description: 'Update an existing project',
      inputSchema: {
        projectId: z.string().describe('The ID of the project to update'),
        name: z.string().optional().describe('New project name'),
        note: z.string().optional().describe('New project note/description'),
        status: z.enum(['active', 'on hold']).optional().describe('New project status'),
        dueDate: z.string().nullable().optional().describe('New due date in ISO format (or null to clear)')
      }
    },
    async (args = {}) => {
      try {
        const { projectId, ...updates } = args;
        const result = metaPIM.omnifocus.updateProject(projectId, updates);
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

  // Create task
  server.registerTool(
    'of_create_task',
    {
      description: 'Create a new task in OmniFocus, including recurring tasks (requires context unless force=true)',
      inputSchema: {
        name: z.string().describe('Task name (required)'),
        note: z.string().optional().describe('Task note/description'),
        project: z.string().optional().describe('Project name to add task to'),
        parentTaskId: z.string().optional().describe('ID of parent task to create this as a subtask'),
        context: z.string().optional().describe('Context/tag name (required unless force=true)'),
        flagged: z.boolean().optional().describe('Whether task is flagged'),
        dueDate: z.string().optional().describe('Due date in ISO format'),
        deferDate: z.string().optional().describe('Defer date in ISO format'),
        repetitionRule: z.object({
          method: z.enum(['fixed', 'start_after_completion', 'due_after_completion']).describe('Repetition method'),
          interval: z.number().describe('Repeat interval (e.g., 1 for every day, 2 for every 2 weeks)'),
          unit: z.enum(['days', 'weeks', 'months', 'years']).describe('Repetition unit')
        }).optional().describe('Repetition rule for recurring tasks'),
        force: z.boolean().optional().default(false).describe('Allow creating task without context')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.createTask(args);
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

  // Complete task
  server.registerTool(
    'of_complete_task',
    {
      description: 'Mark a task as completed',
      inputSchema: {
        taskId: z.string().describe('The ID of the task to complete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.completeTask(args.taskId);
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

  // Update task
  server.registerTool(
    'of_update_task',
    {
      description: 'Update an existing task',
      inputSchema: {
        taskId: z.string().describe('The ID of the task to update'),
        name: z.string().optional().describe('New task name'),
        note: z.string().optional().describe('New task note'),
        flagged: z.boolean().optional().describe('New flagged status'),
        dueDate: z.string().nullable().optional().describe('New due date in ISO format (or null to clear)'),
        deferDate: z.string().nullable().optional().describe('New defer date in ISO format (or null to clear)')
      }
    },
    async (args = {}) => {
      try {
        const { taskId, ...updates } = args;
        const result = metaPIM.omnifocus.updateTask(taskId, updates);
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

  // Complete project
  server.registerTool(
    'of_complete_project',
    {
      description: 'Mark a project as completed',
      inputSchema: {
        projectId: z.string().describe('The ID of the project to complete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.completeProject(args.projectId);
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

  // Delete project
  server.registerTool(
    'of_delete_project',
    {
      description: 'Delete a project from OmniFocus',
      inputSchema: {
        projectId: z.string().describe('The ID of the project to delete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.deleteProject(args.projectId);
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

  // Delete task
  server.registerTool(
    'of_delete_task',
    {
      description: 'Delete a task from OmniFocus',
      inputSchema: {
        taskId: z.string().describe('The ID of the task to delete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.deleteTask(args.taskId);
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

  // Get folders
  server.registerTool(
    'of_get_folders',
    {
      description: 'Get all folders from OmniFocus',
      inputSchema: {}
    },
    async (args = {}) => {
      try {
        const folders = metaPIM.omnifocus.getFolders();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(folders, null, 2)
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

  // Create folder
  server.registerTool(
    'of_create_folder',
    {
      description: 'Create a new folder in OmniFocus',
      inputSchema: {
        name: z.string().describe('Folder name (required)'),
        parentFolder: z.string().optional().describe('Parent folder name')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.createFolder(args);
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

  // Update folder
  server.registerTool(
    'of_update_folder',
    {
      description: 'Update an existing folder',
      inputSchema: {
        folderId: z.string().describe('The ID of the folder to update'),
        name: z.string().optional().describe('New folder name')
      }
    },
    async (args = {}) => {
      try {
        const { folderId, ...updates } = args;
        const result = metaPIM.omnifocus.updateFolder(folderId, updates);
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

  // Delete folder
  server.registerTool(
    'of_delete_folder',
    {
      description: 'Delete a folder from OmniFocus',
      inputSchema: {
        folderId: z.string().describe('The ID of the folder to delete')
      }
    },
    async (args = {}) => {
      try {
        const result = metaPIM.omnifocus.deleteFolder(args.folderId);
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

  // Get tasks by date filter
  server.registerTool(
    'of_get_tasks_by_date',
    {
      description: 'Get tasks filtered by date criteria (due today, overdue, deferred, etc.)',
      inputSchema: {
        filterType: z.enum(['all', 'due_today', 'due_soon', 'overdue', 'deferred', 'available'])
          .default('all')
          .describe('Date filter type: all (no filter), due_today, due_soon (within daysAhead), overdue, deferred (future defer date), available (not deferred or past defer date)'),
        daysAhead: z.number().optional().default(7).describe('Number of days ahead for "due_soon" filter'),
        includeCompleted: z.boolean().optional().default(false).describe('Include completed tasks in results')
      }
    },
    async (args = {}) => {
      try {
        const { filterType = 'all', ...options } = args;
        const tasks = metaPIM.omnifocus.getTasksByDateFilter(filterType, options);
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

  // Register Obsidian tools with "obs_" prefix
  // Note: Tool names must match the actual Obsidian MCP server tool names
  
  // Search notes (keeping original for backward compatibility)
  server.registerTool(
    'obs_search_notes',
    {
      description: 'Search notes in Obsidian',
      inputSchema: {
        query: z.string().describe('Search query'),
        tag: z.string().optional().describe('Filter by tag')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_global_search', arguments: { query: args.query } }
        );
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
  
  // Read note
  server.registerTool(
    'obs_read_note',
    {
      description: 'Read a note from Obsidian vault',
      inputSchema: {
        path: z.string().describe('Path to the note'),
        format: z.enum(['markdown', 'json']).optional().describe('Output format')
      }
    },
    async (args) => {
      try {
        // Map params to what Obsidian expects
        const obsidianArgs = {
          filePath: args.path,
          format: args.format || 'markdown'
        };
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_read_note', arguments: obsidianArgs }
        );
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

  // Update note
  server.registerTool(
    'obs_update_note',
    {
      description: 'Update or create a note in Obsidian',
      inputSchema: {
        path: z.string().optional().describe('Path to the note'),
        content: z.string().describe('Content to add'),
        mode: z.enum(['append', 'prepend', 'overwrite']).describe('How to update the note'),
        targetType: z.enum(['filePath', 'activeFile', 'periodicNote']).optional().describe('Target type'),
        periodicType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional().describe('Type of periodic note when targetType is periodic')
      }
    },
    async (args) => {
      try {
        // Map our simplified params to what Obsidian MCP expects
        const obsidianArgs = {
          targetType: args.targetType || 'filePath',
          targetIdentifier: args.path,  // Use targetIdentifier instead of filePath
          content: args.content,
          modificationType: 'wholeFile'  // Default to wholeFile
        };
        
        // Map mode to what Obsidian expects
        if (args.mode === 'append') {
          obsidianArgs.modificationType = 'append';
        } else if (args.mode === 'prepend') {
          obsidianArgs.modificationType = 'prepend';
        } else if (args.mode === 'overwrite') {
          obsidianArgs.modificationType = 'wholeFile';
          obsidianArgs.wholeFileMode = 'overwrite';  // Add this for wholeFile mode
          obsidianArgs.overwriteIfExists = true;  // Allow overwriting existing files
        }
        
        if (args.periodicType) {
          obsidianArgs.targetIdentifier = args.periodicType;
          obsidianArgs.targetType = 'periodicNote';
        }
        
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_update_note', arguments: obsidianArgs }
        );
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

  // Global search
  server.registerTool(
    'obs_global_search',
    {
      description: 'Search across entire Obsidian vault',
      inputSchema: {
        query: z.string().describe('Search query'),
        type: z.enum(['text', 'regex']).optional().describe('Search type'),
        path: z.string().optional().describe('Filter by path'),
        limit: z.number().optional().describe('Max results')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_global_search', arguments: args }
        );
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

  // List notes
  server.registerTool(
    'obs_list_notes',
    {
      description: 'List notes in Obsidian vault',
      inputSchema: {
        path: z.string().optional().describe('Directory path'),
        extension: z.string().optional().describe('Filter by extension'),
        recursive: z.boolean().optional().describe('Include subdirectories')
      }
    },
    async (args) => {
      try {
        // Map our params to what Obsidian expects
        const obsidianArgs = {
          dirPath: args.path || '/',
          extension: args.extension,
          recursive: args.recursive
        };
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_list_notes', arguments: obsidianArgs }
        );
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

  // Manage tags
  server.registerTool(
    'obs_manage_tags',
    {
      description: 'Manage tags for an Obsidian note',
      inputSchema: {
        path: z.string().describe('Path to the note'),
        action: z.enum(['add', 'remove', 'list']).describe('Action to perform'),
        tags: z.array(z.string()).optional().describe('Tags to add/remove (without # prefix)')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_manage_tags', arguments: args }
        );
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

  // Search and replace in note
  server.registerTool(
    'obs_search_replace',
    {
      description: 'Search and replace text in an Obsidian note',
      inputSchema: {
        path: z.string().describe('Path to the note'),
        search: z.string().describe('Text or regex pattern to search'),
        replace: z.string().describe('Replacement text'),
        searchType: z.enum(['string', 'regex']).optional().describe('Type of search'),
        caseSensitive: z.boolean().optional().describe('Case sensitive search'),
        wholeWord: z.boolean().optional().describe('Match whole words only'),
        replaceAll: z.boolean().optional().describe('Replace all occurrences')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_search_replace', arguments: args }
        );
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

  // Manage frontmatter
  server.registerTool(
    'obs_manage_frontmatter',
    {
      description: 'Manage YAML frontmatter for an Obsidian note',
      inputSchema: {
        path: z.string().describe('Path to the note'),
        action: z.enum(['get', 'set', 'delete']).describe('Action to perform'),
        key: z.string().optional().describe('Frontmatter key'),
        value: z.any().optional().describe('Value to set (for set action)')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_manage_frontmatter', arguments: args }
        );
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

  // Delete note
  server.registerTool(
    'obs_delete_note',
    {
      description: 'Delete a note from Obsidian vault',
      inputSchema: {
        path: z.string().describe('Path to the note to delete')
      }
    },
    async (args) => {
      try {
        const result = await metaPIM.callExternalMCP(
          metaPIM.obsidianProcess,
          'tools/call',
          { name: 'obsidian_delete_note', arguments: args }
        );
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

  // Connect to transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('PIM Meta Server running...');
  
  // Cleanup on exit
  process.on('SIGINT', () => {
    metaPIM.cleanup();
    process.exit();
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});