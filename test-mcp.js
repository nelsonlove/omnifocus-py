#!/usr/bin/env node

import { spawn } from 'child_process';
import { createInterface } from 'readline';

// Start the MCP server
const mcp = spawn('omnifocus-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit']
});

const rl = createInterface({
  input: mcp.stdout,
  crlfDelay: Infinity
});

// Send initialize request
const initRequest = {
  jsonrpc: '2.0',
  method: 'initialize',
  params: {
    capabilities: {}
  },
  id: 1
};

mcp.stdin.write(JSON.stringify(initRequest) + '\n');

// Read responses
rl.on('line', (line) => {
  try {
    const response = JSON.parse(line);
    console.log('Response:', JSON.stringify(response, null, 2));
    
    // After initialize, list tools
    if (response.id === 1) {
      const listToolsRequest = {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2
      };
      mcp.stdin.write(JSON.stringify(listToolsRequest) + '\n');
    }
    
    // After listing tools, call get_tasks
    if (response.id === 2) {
      const callToolRequest = {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_tasks',
          arguments: {}
        },
        id: 3
      };
      mcp.stdin.write(JSON.stringify(callToolRequest) + '\n');
    }
    
    // Exit after get_tasks response
    if (response.id === 3) {
      process.exit(0);
    }
  } catch (e) {
    console.error('Error parsing response:', e);
  }
});

mcp.on('error', (err) => {
  console.error('MCP server error:', err);
});

setTimeout(() => {
  console.log('Timeout - no response');
  process.exit(1);
}, 5000);