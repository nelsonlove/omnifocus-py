#!/usr/bin/env node

import { OmniFocusClient } from './src/omnifocus.js';

async function test() {
  const client = new OmniFocusClient();
  
  console.log('Testing OmniFocus MCP Integration\n');
  console.log('=================================\n');
  
  try {
    console.log('1. Testing getProjects...');
    const projects = client.getProjects();
    console.log(`   Found ${projects.length} projects`);
    if (projects.length > 0) {
      console.log(`   First project: ${projects[0].name}`);
    }
    
    console.log('\n2. Testing getContexts...');
    const contexts = client.getContexts();
    console.log(`   Found ${contexts.length} contexts/tags`);
    
    console.log('\n3. Testing getTasks...');
    const tasks = client.getTasks({ completed: false });
    console.log(`   Found ${tasks.length} incomplete tasks`);
    if (tasks.length > 0) {
      console.log(`   First task: ${tasks[0].name}`);
    }
    
    console.log('\n4. Testing createTask...');
    const newTask = client.createTask({
      name: 'Test Task from MCP',
      note: 'This is a test task created by the OmniFocus MCP server',
      flagged: true
    });
    console.log(`   Created task: ${newTask.name} (ID: ${newTask.id})`);
    
    console.log('\n5. Testing updateTask...');
    const updated = client.updateTask(newTask.id, {
      name: 'Test Task from MCP (Updated)',
      flagged: false
    });
    console.log(`   Updated task: ${updated.name}`);
    
    console.log('\n6. Testing completeTask...');
    const completed = client.completeTask(newTask.id);
    console.log(`   Completed task: ${completed.name}`);
    
    console.log('\n✅ All tests passed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nMake sure:');
    console.error('1. OmniFocus is running');
    console.error('2. Terminal has permission to control OmniFocus');
    console.error('   (System Preferences > Security & Privacy > Privacy > Automation)');
  }
}

test();