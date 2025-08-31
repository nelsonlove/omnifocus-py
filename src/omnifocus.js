import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

export class OmniFocusClient {
  runJXA(script) {
    try {
      // Write script to temp file and execute it
      const tempFile = `/tmp/jxa-script-${Date.now()}.js`;
      writeFileSync(tempFile, script);
      
      const result = execSync(`osascript -l JavaScript ${tempFile}`, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      
      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
      
      return result.trim();
    } catch (error) {
      throw new Error(`JXA execution failed: ${error.message}`);
    }
  }

  getTasks(options = {}) {
    const { project, context, contexts, contextMode = 'any', flagged, completed = false } = options;
    // context: single context for backward compatibility
    // contexts: array of contexts for set operations
    // contextMode: 'any' (OR), 'all' (AND), 'none' (NOT)
    
    // Build the whose clause dynamically
    const whereConditions = [];
    if (completed !== undefined) {
      whereConditions.push(`completed: ${completed}`);
    }
    if (flagged !== undefined) {
      whereConditions.push(`flagged: ${flagged}`);
    }
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      
      ${whereConditions.length > 0 ? 
        `const tasks = doc.flattenedTasks.whose({${whereConditions.join(', ')}})();` : 
        'const tasks = doc.flattenedTasks();'
      }
      
      const results = [];
      for (let task of tasks) {
        try {
          ${project ? 
            `if (!task.container() || task.container().name() !== "${project}") continue;` : 
            ''
          }
          
          const taskTags = task.tags();
          const tagNames = [];
          for (let tag of taskTags) {
            tagNames.push(tag.name());
          }
          
          ${context ? 
            `// Single context for backward compatibility
            let hasContext = false;
            for (let tag of taskTags) {
              if (tag.name() === "${context}") {
                hasContext = true;
                break;
              }
            }
            if (!hasContext) continue;` : 
            ''
          }
          
          ${contexts && contexts.length > 0 ? 
            `// Multiple contexts with set operations
            const contextList = ${JSON.stringify(contexts)};
            const matchingContexts = [];
            for (let tag of taskTags) {
              if (contextList.includes(tag.name())) {
                matchingContexts.push(tag.name());
              }
            }
            
            if ("${contextMode}" === "all") {
              // AND: task must have ALL specified contexts
              if (matchingContexts.length !== contextList.length) continue;
            } else if ("${contextMode}" === "none") {
              // NOT: task must have NONE of the specified contexts
              if (matchingContexts.length > 0) continue;
            } else {
              // any (OR): task must have AT LEAST ONE of the specified contexts
              if (matchingContexts.length === 0) continue;
            }` :
            ''
          }
          
          results.push({
            id: task.id(),
            name: task.name(),
            note: task.note() || "",
            flagged: task.flagged(),
            completed: task.completed(),
            deferDate: task.deferDate() ? task.deferDate().toISOString() : null,
            dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
            project: task.container() ? task.container().name() : null,
            tags: tagNames
          });
        } catch(e) {}
      }
      JSON.stringify(results);
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result || '[]');
  }

  getProjects() {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects();
      
      const results = [];
      for (let project of projects) {
        let folderName = null;
        try {
          // Try to find which folder contains this project
          const folders = doc.flattenedFolders();
          for (let folder of folders) {
            const folderProjects = folder.projects();
            for (let fp of folderProjects) {
              if (fp.id() === project.id()) {
                folderName = folder.name();
                break;
              }
            }
            if (folderName) break;
          }
        } catch (e) {
          // Error getting folder
        }
        
        results.push({
          id: project.id(),
          name: project.name(),
          note: project.note() || "",
          status: project.status(),
          folder: folderName,
          dueDate: project.dueDate() ? project.dueDate().toISOString() : null,
          completionDate: project.completionDate() ? project.completionDate().toISOString() : null
        });
      }
      JSON.stringify(results);
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result || '[]');
  }

  getProject(projectId) {
    // First get the project details
    const projectScript = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects.whose({id: "${projectId}"})();
      
      if (projects.length === 0) {
        throw new Error("Project not found");
      }
      
      const project = projects[0];
      JSON.stringify({
        id: project.id(),
        name: project.name(),
        note: project.note() || "",
        status: project.status(),
        dueDate: project.dueDate() ? project.dueDate().toISOString() : null,
        completionDate: project.completionDate() ? project.completionDate().toISOString() : null
      });
    `;
    
    const project = JSON.parse(this.runJXA(projectScript));
    
    // Get all tasks for this project
    const tasksScript = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects.whose({id: "${projectId}"})();
      
      if (projects.length === 0) {
        throw new Error("Project not found");
      }
      
      const project = projects[0];
      const rootTasks = project.rootTask.tasks();
      
      const results = [];
      for (let task of rootTasks) {
        results.push(task.id());
      }
      JSON.stringify(results);
    `;
    
    const taskIds = JSON.parse(this.runJXA(tasksScript));
    
    // Recursively get each task with its subtasks
    project.tasks = taskIds.map(taskId => this.getTask(taskId));
    
    return project;
  }

  getTask(taskId) {
    const taskScript = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks.whose({id: "${taskId}"})();
      
      if (tasks.length === 0) {
        throw new Error("Task not found");
      }
      
      const task = tasks[0];
      const taskTags = task.tags();
      const tagNames = [];
      for (let tag of taskTags) {
        tagNames.push(tag.name());
      }
      
      // Get subtask IDs
      const subtasks = task.tasks();
      const subtaskIds = [];
      for (let subtask of subtasks) {
        subtaskIds.push(subtask.id());
      }
      
      // Get parent task ID if exists
      let parentTaskId = null;
      try {
        const parentTask = task.parentTask();
        if (parentTask) {
          // Check if parent is a regular task (not the project root)
          const project = task.containingProject();
          if (project && project.rootTask && parentTask.id() !== project.rootTask.id()) {
            parentTaskId = parentTask.id();
          }
        }
      } catch (e) {
        // No parent task or error accessing it
      }
      
      JSON.stringify({
        id: task.id(),
        name: task.name(),
        note: task.note() || "",
        flagged: task.flagged(),
        completed: task.completed(),
        dueDate: task.dueDate() ? task.dueDate().toISOString() : null,
        project: task.containingProject() ? task.containingProject().name() : null,
        tags: tagNames,
        parentTaskId: parentTaskId,
        subtaskIds: subtaskIds
      });
    `;
    
    const task = JSON.parse(this.runJXA(taskScript));
    
    // Recursively get subtasks
    if (task.subtaskIds && task.subtaskIds.length > 0) {
      task.subtasks = task.subtaskIds.map(subtaskId => this.getTask(subtaskId));
      delete task.subtaskIds; // Remove the IDs array since we have the full objects
    } else {
      task.subtasks = [];
    }
    
    return task;
  }

  createProject(options) {
    const { name, note, folder, status = 'active', dueDate } = options;
    
    if (!name) {
      throw new Error('Project name is required');
    }

    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      
      // Check if project already exists
      const existingProjects = doc.flattenedProjects.whose({name: "${name.replace(/"/g, '\\"')}"})();
      if (existingProjects.length > 0) {
        throw new Error("Project with this name already exists");
      }
      
      const project = app.Project({
        name: "${name.replace(/"/g, '\\"')}"
        ${note ? `, note: "${note.replace(/"/g, '\\"')}"` : ''}
        ${status === 'on hold' ? `, status: "on hold status"` : ''}
        ${dueDate ? `, dueDate: new Date("${dueDate}")` : ''}
      });
      
      ${folder ? `
        const folders = doc.flattenedFolders.whose({name: "${folder}"})();
        if (folders.length > 0) {
          folders[0].projects.push(project);
        } else {
          doc.projects.push(project);
        }
      ` : 'doc.projects.push(project);'}
      
      JSON.stringify({
        id: project.id(),
        name: project.name(),
        created: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  createTask(options) {
    const { name, note, project, parentTaskId, context, flagged, dueDate, deferDate, repetitionRule, force = false } = options;
    
    if (!name) {
      throw new Error('Task name is required');
    }

    // Require context unless force=true
    if (!context && !force) {
      throw new Error('Context is required for new tasks. Set force=true to create a task without a context.');
    }

    // Escape strings for JavaScript - handle quotes, apostrophes, newlines, and backslashes
    const escapeForJS = (str) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };

    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      
      const task = app.InboxTask({
        name: "${escapeForJS(name)}"
        ${note ? `, note: "${escapeForJS(note)}"` : ''}
        ${flagged !== undefined ? `, flagged: ${flagged}` : ''}
        ${dueDate ? `, dueDate: new Date("${dueDate}")` : ''}
        ${deferDate ? `, deferDate: new Date("${deferDate}")` : ''}
      });
      
      ${parentTaskId ? `
        // If parentTaskId is provided, add as subtask
        const parentTasks = doc.flattenedTasks.whose({id: "${parentTaskId}"})();
        if (parentTasks.length > 0) {
          const parentTask = parentTasks[0];
          parentTask.tasks.push(task);
        } else {
          throw new Error("Parent task not found");
        }
      ` : `
        // Otherwise add to inbox or project
        doc.inboxTasks.push(task);
        
        ${project ? `
          const projects = doc.flattenedProjects.whose({name: "${project}"})();
          if (projects.length > 0) {
            task.assignedContainer = projects[0];
          }
        ` : ''}
      `}
      
      ${context ? `
        const tags = doc.flattenedTags.whose({name: "${context}"})();
        if (tags.length > 0) {
          task.primaryTag = tags[0];
        }
      ` : ''}
      
      
      JSON.stringify({
        id: task.id(),
        name: task.name(),
        created: true,
        recurring: ${repetitionRule ? 'true' : 'false'}
      });
    `;
    
    const result = this.runJXA(script);
    const taskData = JSON.parse(result);
    
    // If we have a repetition rule, set it using AppleScript
    // (JXA can't set repetition properties due to type conversion issues)
    if (repetitionRule && taskData.id) {
      // Convert unit to singular form for AppleScript
      const unitMap = {
        'days': 'day',
        'day': 'day',
        'weeks': 'week',
        'week': 'week',
        'months': 'month',
        'month': 'month',
        'years': 'year',
        'year': 'year'
      };
      
      const unit = unitMap[repetitionRule.unit] || 'day';
      const fixed = repetitionRule.method === 'fixed' ? 'true' : 'false';
      
      const appleScript = `
        tell application "OmniFocus"
          tell default document
            set targetTask to first item of (flattened tasks whose id is "${taskData.id}")
            set repetition of targetTask to {unit:${unit}, steps:${repetitionRule.interval}, fixed:${fixed}}
            return "ok"
          end tell
        end tell
      `;
      
      try {
        execSync(`osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`, {
          encoding: 'utf8'
        });
        taskData.recurring = true;
      } catch (e) {
        // Repetition setting failed, but task was created
        console.error('Warning: Could not set repetition rule:', e.message);
      }
    }
    
    return taskData;
  }

  completeTask(taskId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks.whose({id: "${taskId}"})();
      
      if (tasks.length > 0) {
        const task = tasks[0];
        const name = task.name();
        task.markComplete();
        JSON.stringify({
          id: "${taskId}",
          name: name,
          completed: true
        });
      } else {
        JSON.stringify({error: "Task not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  updateTask(taskId, updates) {
    const { name, note, flagged, dueDate, deferDate, project, context } = updates;
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks.whose({id: "${taskId}"})();
      
      if (tasks.length > 0) {
        const task = tasks[0];
        ${name ? `task.name = "${name.replace(/"/g, '\\"')}";` : ''}
        ${note !== undefined ? `task.note = "${note.replace(/"/g, '\\"')}";` : ''}
        ${flagged !== undefined ? `task.flagged = ${flagged};` : ''}
        ${dueDate !== undefined ? `task.dueDate = ${dueDate ? `new Date("${dueDate}")` : 'null'};` : ''}
        ${deferDate !== undefined ? `task.deferDate = ${deferDate ? `new Date("${deferDate}")` : 'null'};` : ''}
        
        ${project !== undefined ? `
          // Move to project (or inbox if project is null)
          if ("${project}" === "null" || "${project}" === "") {
            // Move to inbox
            task.assignedContainer = null;
          } else {
            const projects = doc.flattenedProjects.whose({name: "${project}"})();
            if (projects.length > 0) {
              task.assignedContainer = projects[0];
            } else {
              throw new Error("Project not found: ${project}");
            }
          }
        ` : ''}
        
        ${context !== undefined ? `
          // Change context/tag
          if ("${context}" === "null" || "${context}" === "") {
            task.primaryTag = null;
          } else {
            const tags = doc.flattenedTags.whose({name: "${context}"})();
            if (tags.length > 0) {
              task.primaryTag = tags[0];
            }
          }
        ` : ''}
        
        JSON.stringify({
          id: task.id(),
          name: task.name(),
          updated: true
        });
      } else {
        JSON.stringify({error: "Task not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  moveTaskToProject(taskId, projectName) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks.whose({id: "${taskId}"})();
      
      if (tasks.length > 0) {
        const task = tasks[0];
        const oldProject = task.assignedContainer() ? task.assignedContainer().name() : "Inbox";
        
        if ("${projectName}" === "inbox" || "${projectName}" === "" || !${projectName ? 'true' : 'false'}) {
          // Move to inbox
          task.assignedContainer = null;
          JSON.stringify({
            id: task.id(),
            name: task.name(),
            moved: true,
            from: oldProject,
            to: "Inbox"
          });
        } else {
          // Move to specific project
          const projects = doc.flattenedProjects.whose({name: "${projectName}"})();
          if (projects.length > 0) {
            task.assignedContainer = projects[0];
            JSON.stringify({
              id: task.id(),
              name: task.name(),
              moved: true,
              from: oldProject,
              to: "${projectName}"
            });
          } else {
            JSON.stringify({
              error: "Project not found: ${projectName}"
            });
          }
        }
      } else {
        JSON.stringify({error: "Task not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  updateProject(projectId, updates) {
    const { name, note, status, dueDate } = updates;
    
    // Escape strings for JavaScript - handle quotes, apostrophes, newlines, and backslashes
    const escapeForJS = (str) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects.whose({id: "${projectId}"})();
      
      if (projects.length === 0) {
        throw new Error("Project not found");
      }
      
      const project = projects[0];
      ${name !== undefined ? `project.name = "${escapeForJS(name)}";` : ''}
      ${note !== undefined ? `project.note = "${escapeForJS(note)}";` : ''}
      ${status !== undefined ? `project.status = "${status === 'on hold' ? 'on hold' : 'active'}";` : ''}
      ${dueDate !== undefined ? (dueDate === null ? 'project.dueDate = null;' : `project.dueDate = new Date("${dueDate}");`) : ''}
      
      JSON.stringify({
        id: project.id(),
        name: project.name(),
        updated: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  completeProject(projectId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects.whose({id: "${projectId}"})();
      
      if (projects.length === 0) {
        throw new Error("Project not found");
      }
      
      const project = projects[0];
      const name = project.name();
      project.markComplete();
      
      JSON.stringify({
        id: project.id(),
        name: name,
        completed: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  deleteProject(projectId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const projects = doc.flattenedProjects.whose({id: "${projectId}"})();
      
      if (projects.length > 0) {
        const project = projects[0];
        const name = project.name();
        app.delete(project);
        JSON.stringify({
          id: "${projectId}",
          name: name,
          deleted: true
        });
      } else {
        JSON.stringify({error: "Project not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  deleteTask(taskId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks.whose({id: "${taskId}"})();
      
      if (tasks.length > 0) {
        const task = tasks[0];
        const name = task.name();
        app.delete(task);
        JSON.stringify({
          id: "${taskId}",
          name: name,
          deleted: true
        });
      } else {
        JSON.stringify({error: "Task not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  getContexts() {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tags = doc.flattenedTags();
      
      const results = [];
      for (let tag of tags) {
        let parentTagName = null;
        try {
          // Find which tag contains this tag as a child
          for (let potentialParent of tags) {
            const children = potentialParent.tags();
            for (let child of children) {
              if (child.id() === tag.id()) {
                parentTagName = potentialParent.name();
                break;
              }
            }
            if (parentTagName) break;
          }
        } catch (e) {
          // Error finding parent
        }
        
        // Get child tags
        const childTags = tag.tags();
        const childNames = [];
        for (let child of childTags) {
          childNames.push(child.name());
        }
        
        results.push({
          id: tag.id(),
          name: tag.name(),
          parentTag: parentTagName,
          childTags: childNames
        });
      }
      JSON.stringify(results);
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result || '[]');
  }

  createContext(options) {
    const { name, parentTag } = options;
    
    if (!name) {
      throw new Error('Context/tag name is required');
    }

    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      
      const tag = app.Tag({name: "${name.replace(/"/g, '\\"')}"});
      
      ${parentTag ? `
        const parents = doc.flattenedTags.whose({name: "${parentTag.replace(/"/g, '\\"')}"})();
        if (parents.length > 0) {
          parents[0].tags.push(tag);
        } else {
          doc.tags.push(tag);
        }
      ` : 'doc.tags.push(tag);'}
      
      JSON.stringify({
        id: tag.id(),
        name: tag.name(),
        created: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  updateContext(contextId, updates) {
    const { name } = updates;
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tags = doc.flattenedTags.whose({id: "${contextId}"})();
      
      if (tags.length === 0) {
        throw new Error("Context/tag not found");
      }
      
      const tag = tags[0];
      ${name !== undefined ? `tag.name = "${name.replace(/"/g, '\\"')}";` : ''}
      
      JSON.stringify({
        id: tag.id(),
        name: tag.name(),
        updated: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  deleteContext(contextId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tags = doc.flattenedTags.whose({id: "${contextId}"})();
      
      if (tags.length > 0) {
        const tag = tags[0];
        const name = tag.name();
        app.delete(tag);
        JSON.stringify({
          id: "${contextId}",
          name: name,
          deleted: true
        });
      } else {
        JSON.stringify({error: "Context/tag not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  getFolders() {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const folders = doc.flattenedFolders();
      
      const results = [];
      for (let folder of folders) {
        let parentFolderName = null;
        try {
          const parent = folder.parentFolder();
          if (parent) {
            parentFolderName = parent.name();
          }
        } catch (e) {
          // Top-level folder
        }
        
        // Get projects in this folder
        const projects = folder.projects();
        const projectNames = [];
        for (let project of projects) {
          projectNames.push(project.name());
        }
        
        // Get subfolders
        const subfolders = folder.folders();
        const subfolderNames = [];
        for (let subfolder of subfolders) {
          subfolderNames.push(subfolder.name());
        }
        
        results.push({
          id: folder.id(),
          name: folder.name(),
          parentFolder: parentFolderName,
          projects: projectNames,
          subfolders: subfolderNames
        });
      }
      JSON.stringify(results);
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result || '[]');
  }

  createFolder(options) {
    const { name, parentFolder } = options;
    
    if (!name) {
      throw new Error('Folder name is required');
    }

    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      
      const folder = app.Folder({name: "${name.replace(/"/g, '\\"')}"});
      
      ${parentFolder ? `
        const parents = doc.flattenedFolders.whose({name: "${parentFolder.replace(/"/g, '\\"')}"})();
        if (parents.length > 0) {
          parents[0].folders.push(folder);
        } else {
          doc.folders.push(folder);
        }
      ` : 'doc.folders.push(folder);'}
      
      JSON.stringify({
        id: folder.id(),
        name: folder.name(),
        created: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  updateFolder(folderId, updates) {
    const { name } = updates;
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const folders = doc.flattenedFolders.whose({id: "${folderId}"})();
      
      if (folders.length === 0) {
        throw new Error("Folder not found");
      }
      
      const folder = folders[0];
      ${name !== undefined ? `folder.name = "${name.replace(/"/g, '\\"')}";` : ''}
      
      JSON.stringify({
        id: folder.id(),
        name: folder.name(),
        updated: true
      });
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  deleteFolder(folderId) {
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const folders = doc.flattenedFolders.whose({id: "${folderId}"})();
      
      if (folders.length > 0) {
        const folder = folders[0];
        const name = folder.name();
        app.delete(folder);
        JSON.stringify({
          id: "${folderId}",
          name: name,
          deleted: true
        });
      } else {
        JSON.stringify({error: "Folder not found"});
      }
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result);
  }

  getTasksByDateFilter(filterType = 'all', options = {}) {
    // filterType can be: 'all', 'due_today', 'due_soon', 'overdue', 'deferred', 'available'
    // options can include: daysAhead (for due_soon), includeCompleted
    const { daysAhead = 7, includeCompleted = false } = options;
    
    // Build the filtering logic based on the filter type
    let filterLogic = '';
    
    if (filterType === 'all') {
      filterLogic = 'include = true;';
    } else if (filterType === 'due_today') {
      filterLogic = `
        if (dueDate) {
          const taskDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          include = taskDue.getTime() === today.getTime();
        }`;
    } else if (filterType === 'due_soon') {
      filterLogic = `
        if (dueDate) {
          const taskDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          include = taskDue <= daysFromNow && taskDue >= today;
        }`;
    } else if (filterType === 'overdue') {
      filterLogic = `
        if (dueDate) {
          const taskDue = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          include = taskDue < today;
        }`;
    } else if (filterType === 'deferred') {
      filterLogic = `
        if (deferDate) {
          include = deferDate > now;
        }`;
    } else if (filterType === 'available') {
      filterLogic = 'include = !deferDate || deferDate <= now;';
    }
    
    const script = `
      const app = Application("OmniFocus");
      const doc = app.defaultDocument;
      const tasks = doc.flattenedTasks();
      const results = [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const daysFromNow = new Date(today);
      daysFromNow.setDate(daysFromNow.getDate() + ${daysAhead});
      
      for (let task of tasks) {
        try {
          // Skip completed tasks unless requested
          if (!${includeCompleted} && task.completed()) continue;
          
          const dueDate = task.dueDate();
          const deferDate = task.deferDate();
          
          let include = false;
          
          ${filterLogic}
          
          if (include) {
            const tagArray = task.tags();
            const tagNames = [];
            for (let tag of tagArray) {
              tagNames.push(tag.name());
            }
            
            results.push({
              id: task.id(),
              name: task.name(),
              note: task.note() || "",
              flagged: task.flagged(),
              completed: task.completed(),
              deferDate: deferDate ? deferDate.toISOString() : null,
              dueDate: dueDate ? dueDate.toISOString() : null,
              project: task.container() ? task.container().name() : null,
              tags: tagNames
            });
          }
        } catch(e) {
          console.log("Error processing task: " + e.message);
        }
      }
      JSON.stringify(results);
    `;
    
    const result = this.runJXA(script);
    return JSON.parse(result || '[]');
  }
}