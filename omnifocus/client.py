"""OmniFocus client — JXA bridge for reading and writing OmniFocus data.

Each method builds a JavaScript for Automation (JXA) script, executes it
via ``osascript -l JavaScript``, and parses the JSON result.
"""

from __future__ import annotations

import json
import os
import subprocess
import tempfile

from .models import Folder, Project, Tag, Task


class OmniFocusError(Exception):
    """Error communicating with OmniFocus."""


def _escape(s: str) -> str:
    """Escape a Python string for safe embedding in a JXA string literal."""
    return (
        s.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("'", "\\'")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )


def _run_jxa(script: str) -> str:
    """Run a JXA script via osascript and return stdout.

    Uses a temp file to avoid shell quoting issues with large scripts.
    Raises ``OmniFocusError`` on non-zero exit.
    """
    fd, path = tempfile.mkstemp(suffix=".js", prefix="jxa-")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(script)
        result = subprocess.run(
            ["osascript", "-l", "JavaScript", path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            raise OmniFocusError(
                result.stderr.strip() or f"osascript exited {result.returncode}"
            )
        return result.stdout.strip()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _run_jxa_json(script: str) -> dict | list:
    """Run a JXA script and parse JSON output."""
    raw = _run_jxa(script)
    if not raw:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OmniFocusError(f"Bad JSON from osascript: {exc}\n{raw[:200]}")


class OmniFocusClient:
    """Python interface to OmniFocus via JXA."""

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def get_tasks(
        self,
        project: str | None = None,
        context: str | None = None,
        flagged: bool | None = None,
        completed: bool = False,
    ) -> list[Task]:
        """Return tasks, optionally filtered by project, context/tag, flagged, or completion status."""

        # Build .whose() conditions for the initial fetch
        whose_parts: list[str] = []
        whose_parts.append(f"completed: {str(completed).lower()}")
        if flagged is not None:
            whose_parts.append(f"flagged: {str(flagged).lower()}")

        whose_clause = "{" + ", ".join(whose_parts) + "}"

        # Build optional JS filter blocks
        project_filter = ""
        if project:
            project_filter = (
                f'if (!task.container() || task.container().name() !== "{_escape(project)}") continue;'
            )

        context_filter = ""
        if context:
            context_filter = f"""
            var hasContext = false;
            for (var ti = 0; ti < taskTags.length; ti++) {{
                if (taskTags[ti].name() === "{_escape(context)}") {{
                    hasContext = true;
                    break;
                }}
            }}
            if (!hasContext) continue;
            """

        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tasks = doc.flattenedTasks.whose({whose_clause})();
var results = [];
for (var i = 0; i < tasks.length; i++) {{
    var task = tasks[i];
    try {{
        {project_filter}
        var taskTags = task.tags();
        var tagNames = [];
        for (var j = 0; j < taskTags.length; j++) {{
            tagNames.push(taskTags[j].name());
        }}
        {context_filter}
        var deferDate = task.deferDate();
        var dueDate = task.dueDate();
        results.push({{
            id: task.id(),
            name: task.name(),
            note: task.note() || "",
            flagged: task.flagged(),
            completed: task.completed(),
            deferDate: deferDate ? deferDate.toISOString() : null,
            dueDate: dueDate ? dueDate.toISOString() : null,
            project: task.container() ? task.container().name() : null,
            tags: tagNames
        }});
    }} catch(e) {{}}
}}
JSON.stringify(results);
"""
        rows = _run_jxa_json(script)
        return [
            Task(
                id=r["id"],
                name=r["name"],
                note=r.get("note", ""),
                flagged=bool(r.get("flagged", False)),
                completed=bool(r.get("completed", False)),
                defer_date=r.get("deferDate"),
                due_date=r.get("dueDate"),
                project=r.get("project"),
                tags=r.get("tags", []),
            )
            for r in rows
        ]

    def get_projects(self) -> list[Project]:
        """Return all projects with folder, status, dates, and tags."""

        script = """\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var projects = doc.flattenedProjects();
var results = [];
for (var i = 0; i < projects.length; i++) {
    var project = projects[i];
    var folderName = null;
    try {
        if (project.parentFolder()) folderName = project.parentFolder().name();
    } catch (e) {}

    var tags = project.tags();
    var tagNames = [];
    for (var j = 0; j < tags.length; j++) {
        tagNames.push(tags[j].name());
    }

    results.push({
        id: project.id(),
        name: project.name(),
        note: project.note() || "",
        status: project.status().toString(),
        folder: folderName,
        dueDate: project.dueDate() ? project.dueDate().toISOString() : null,
        completionDate: project.completionDate() ? project.completionDate().toISOString() : null,
        tags: tagNames
    });
}
JSON.stringify(results);
"""
        rows = _run_jxa_json(script)
        return [
            Project(
                id=r["id"],
                name=r["name"],
                note=r.get("note", ""),
                status=r.get("status", "active"),
                folder=r.get("folder"),
                due_date=r.get("dueDate"),
                completion_date=r.get("completionDate"),
                tags=r.get("tags", []),
            )
            for r in rows
        ]

    def get_contexts(self) -> list[Tag]:
        """Return all tags (contexts) with parent/child relationships."""

        script = """\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tags = doc.flattenedTags();
var results = [];
for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var parentTagName = null;
    try {
        for (var j = 0; j < tags.length; j++) {
            var children = tags[j].tags();
            for (var k = 0; k < children.length; k++) {
                if (children[k].id() === tag.id()) {
                    parentTagName = tags[j].name();
                    break;
                }
            }
            if (parentTagName) break;
        }
    } catch (e) {}

    var childTags = tag.tags();
    var childNames = [];
    for (var c = 0; c < childTags.length; c++) {
        childNames.push(childTags[c].name());
    }

    results.push({
        id: tag.id(),
        name: tag.name(),
        parentTag: parentTagName,
        childTags: childNames
    });
}
JSON.stringify(results);
"""
        rows = _run_jxa_json(script)
        return [
            Tag(
                id=r["id"],
                name=r["name"],
                parent_tag=r.get("parentTag"),
                child_tags=r.get("childTags", []),
            )
            for r in rows
        ]

    def get_folders(self) -> list[Folder]:
        """Return all folders with parent, projects, and subfolders."""

        script = """\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var folders = doc.flattenedFolders();
var results = [];
for (var i = 0; i < folders.length; i++) {
    var folder = folders[i];
    var parentFolderName = null;
    try {
        var parent = folder.parentFolder();
        if (parent) parentFolderName = parent.name();
    } catch (e) {}

    var projects = folder.projects();
    var projectNames = [];
    for (var j = 0; j < projects.length; j++) {
        projectNames.push(projects[j].name());
    }

    var subfolders = folder.folders();
    var subfolderNames = [];
    for (var k = 0; k < subfolders.length; k++) {
        subfolderNames.push(subfolders[k].name());
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
"""
        rows = _run_jxa_json(script)
        return [
            Folder(
                id=r["id"],
                name=r["name"],
                parent_folder=r.get("parentFolder"),
                projects=r.get("projects", []),
                subfolders=r.get("subfolders", []),
            )
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def create_task(
        self,
        name: str,
        note: str | None = None,
        project: str | None = None,
        parent_task_id: str | None = None,
        context: str | None = None,
        flagged: bool | None = None,
        due_date: str | None = None,
        defer_date: str | None = None,
    ) -> dict:
        """Create an inbox task.

        Optionally assign to *project* (by name), nest under *parent_task_id*,
        set a tag (*context*), flag it, or set dates.  Returns
        ``{id, name, created: True}``.
        """
        esc_name = _escape(name)

        note_js = f', note: "{_escape(note)}"' if note else ""
        flagged_js = f", flagged: {str(flagged).lower()}" if flagged is not None else ""
        due_js = f', dueDate: new Date("{due_date}")' if due_date else ""
        defer_js = f', deferDate: new Date("{defer_date}")' if defer_date else ""

        # Where to put the task: parent task or inbox (+ optional project)
        if parent_task_id:
            esc_pid = _escape(parent_task_id)
            placement_js = f"""\
var parentTasks = doc.flattenedTasks.whose({{id: "{esc_pid}"}})();
if (parentTasks.length > 0) {{
    parentTasks[0].tasks.push(task);
}} else {{
    throw new Error("Parent task not found");
}}"""
        else:
            project_assign = ""
            if project:
                esc_proj = _escape(project)
                project_assign = f"""\
var projects = doc.flattenedProjects.whose({{name: "{esc_proj}"}})();
if (projects.length > 0) {{
    task.assignedContainer = projects[0];
}}"""
            placement_js = f"""\
doc.inboxTasks.push(task);
{project_assign}"""

        context_js = ""
        if context:
            esc_ctx = _escape(context)
            context_js = f"""\
var tags = doc.flattenedTags.whose({{name: "{esc_ctx}"}})();
if (tags.length > 0) {{
    task.primaryTag = tags[0];
}}"""

        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var task = app.InboxTask({{
    name: "{esc_name}"{note_js}{flagged_js}{due_js}{defer_js}
}});
{placement_js}
{context_js}
JSON.stringify({{
    id: task.id(),
    name: task.name(),
    created: true
}});
"""
        return _run_jxa_json(script)

    def create_project(
        self,
        name: str,
        note: str | None = None,
        folder: str | None = None,
        status: str = "active",
        due_date: str | None = None,
        tags: list[str] | None = None,
    ) -> dict:
        """Create a project, optionally in a folder and with tags.

        Returns ``{id, name, created: True}``.
        """
        esc_name = _escape(name)

        note_js = f', note: "{_escape(note)}"' if note else ""
        status_js = ', status: "on hold status"' if status == "on hold" else ""
        due_js = f', dueDate: new Date("{due_date}")' if due_date else ""

        if folder:
            esc_folder = _escape(folder)
            folder_js = f"""\
var folders = doc.flattenedFolders.whose({{name: "{esc_folder}"}})();
if (folders.length > 0) {{
    folders[0].projects.push(project);
}} else {{
    doc.projects.push(project);
}}"""
        else:
            folder_js = "doc.projects.push(project);"

        tag_js = ""
        if tags:
            for t in tags:
                esc_t = _escape(t)
                tag_js += f"""\
var tagObj = null;
var allTags = doc.flattenedTags();
for (var ti = 0; ti < allTags.length; ti++) {{
    if (allTags[ti].name() === "{esc_t}") {{
        tagObj = allTags[ti];
        break;
    }}
}}
if (tagObj) {{
    app.add(tagObj, {{to: project.tags}});
}}
"""

        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var project = app.Project({{
    name: "{esc_name}"{note_js}{status_js}{due_js}
}});
{folder_js}
{tag_js}
JSON.stringify({{
    id: project.id(),
    name: project.name(),
    created: true
}});
"""
        return _run_jxa_json(script)

    def update_task(
        self,
        task_id: str,
        name: str | None = None,
        note: str | None = None,
        flagged: bool | None = None,
        due_date: str | None = None,
        defer_date: str | None = None,
        project: str | None = None,
        context: str | None = None,
    ) -> dict:
        """Update fields on an existing task.

        Only provided (non-None) fields are changed.
        Returns ``{id, name, updated: True}``.
        """
        esc_id = _escape(task_id)

        updates: list[str] = []
        if name is not None:
            updates.append(f'task.name = "{_escape(name)}";')
        if note is not None:
            updates.append(f'task.note = "{_escape(note)}";')
        if flagged is not None:
            updates.append(f"task.flagged = {str(flagged).lower()};")
        if due_date is not None:
            updates.append(f'task.dueDate = new Date("{due_date}");')
        if defer_date is not None:
            updates.append(f'task.deferDate = new Date("{defer_date}");')

        if project is not None:
            esc_proj = _escape(project)
            # assignedContainer only works for inbox tasks; use Omni
            # Automation's moveTasks() via evaluateJavascript() to move
            # tasks that are already inside a project.
            updates.append(f"""\
app.evaluateJavascript('\
var t = Task.byIdentifier("' + task.id() + '");\
var ps = flattenedProjects.filter(function(p){{ return p.name === "{esc_proj}"; }});\
if (t && ps.length > 0) {{ moveTasks([t], ps[0]); }}\
');""")

        if context is not None:
            esc_ctx = _escape(context)
            updates.append(f"""\
var ctxTags = doc.flattenedTags.whose({{name: "{esc_ctx}"}})();
if (ctxTags.length > 0) {{
    task.primaryTag = ctxTags[0];
}}""")

        updates_js = "\n".join(updates)

        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tasks = doc.flattenedTasks.whose({{id: "{esc_id}"}})();
if (tasks.length === 0) {{
    throw new Error("Task not found");
}}
var task = tasks[0];
{updates_js}
JSON.stringify({{
    id: task.id(),
    name: task.name(),
    updated: true
}});
"""
        return _run_jxa_json(script)

    def update_project(
        self,
        project_id: str,
        name: str | None = None,
        note: str | None = None,
        status: str | None = None,
        due_date: str | None = None,
    ) -> dict:
        """Update fields on an existing project.

        Returns ``{id, name, updated: True}``.
        """
        esc_id = _escape(project_id)

        updates: list[str] = []
        if name is not None:
            updates.append(f'project.name = "{_escape(name)}";')
        if note is not None:
            updates.append(f'project.note = "{_escape(note)}";')
        if status is not None:
            of_status = "on hold" if status == "on hold" else "active"
            updates.append(f'project.status = "{of_status}";')
        if due_date is not None:
            updates.append(f'project.dueDate = new Date("{due_date}");')

        updates_js = "\n".join(updates)

        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var projects = doc.flattenedProjects.whose({{id: "{esc_id}"}})();
if (projects.length === 0) {{
    throw new Error("Project not found");
}}
var project = projects[0];
{updates_js}
JSON.stringify({{
    id: project.id(),
    name: project.name(),
    updated: true
}});
"""
        return _run_jxa_json(script)

    def complete_task(self, task_id: str) -> dict:
        """Mark a task complete.

        Returns ``{id, name, completed: True}``.
        """
        esc_id = _escape(task_id)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tasks = doc.flattenedTasks.whose({{id: "{esc_id}"}})();
if (tasks.length === 0) {{
    throw new Error("Task not found");
}}
var task = tasks[0];
var taskName = task.name();
task.markComplete();
JSON.stringify({{
    id: "{esc_id}",
    name: taskName,
    completed: true
}});
"""
        return _run_jxa_json(script)

    def delete_task(self, task_id: str) -> dict:
        """Delete a task.

        Returns ``{id, name, deleted: True}``.
        """
        esc_id = _escape(task_id)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tasks = doc.flattenedTasks.whose({{id: "{esc_id}"}})();
if (tasks.length === 0) {{
    throw new Error("Task not found");
}}
var task = tasks[0];
var taskName = task.name();
app.delete(task);
JSON.stringify({{
    id: "{esc_id}",
    name: taskName,
    deleted: true
}});
"""
        return _run_jxa_json(script)

    # ------------------------------------------------------------------
    # Tag operations
    # ------------------------------------------------------------------

    def rename_tag(self, old_name: str, new_name: str) -> None:
        """Rename an OmniFocus tag.  Preserves hierarchy and task associations."""
        esc_old = _escape(old_name)
        esc_new = _escape(new_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tags = doc.flattenedTags();
var tag = null;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_old}") {{
        tag = tags[i];
        break;
    }}
}}
if (!tag) throw new Error("Tag not found: {esc_old}");
tag.name = "{esc_new}";
'ok';
"""
        _run_jxa(script)

    def move_tag(self, tag_name: str, parent_name: str | None) -> None:
        """Move a tag to be a child of another tag, or to the top level.

        OmniFocus JXA doesn't support reparenting tags directly, so this
        collects all tagged tasks/projects, deletes the old tag, recreates
        it under the new parent, and reassigns all associations.
        """
        esc_tag = _escape(tag_name)
        if parent_name is None:
            script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tags = doc.flattenedTags();
var tag = null;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}") {{ tag = tags[i]; break; }}
}}
if (!tag) throw new Error("Tag not found: {esc_tag}");

// Collect tagged task/project IDs
var taskIds = [];
var tasks = doc.flattenedTasks();
for (var i = 0; i < tasks.length; i++) {{
    var tt = tasks[i].tags();
    for (var j = 0; j < tt.length; j++) {{
        if (tt[j].id() === tag.id()) {{ taskIds.push(tasks[i].id()); break; }}
    }}
}}
// Collect children names (to recreate)
var childNames = [];
var children = tag.tags();
for (var i = 0; i < children.length; i++) {{ childNames.push(children[i].name()); }}

// Delete old tag
tag.delete();

// Recreate at top level
var newTag = app.Tag({{name: "{esc_tag}"}});
doc.tags.push(newTag);

// Recreate children
for (var i = 0; i < childNames.length; i++) {{
    newTag.tags.push(app.Tag({{name: childNames[i]}}));
}}

// Reassign tasks
tags = doc.flattenedTags();
var fresh = null;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}" && tags[i].parentTag() === null) {{ fresh = tags[i]; break; }}
}}
if (fresh) {{
    for (var i = 0; i < taskIds.length; i++) {{
        var t = doc.flattenedTasks.whose({{id: taskIds[i]}})()[0];
        if (t) t.tags.push(fresh);
    }}
}}
JSON.stringify({{moved: true, tasks_reassigned: taskIds.length, children: childNames.length}});
"""
        else:
            esc_parent = _escape(parent_name)
            script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tags = doc.flattenedTags();
var tag = null;
var parent = null;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}") tag = tags[i];
    if (tags[i].name() === "{esc_parent}") parent = tags[i];
}}
if (!tag) throw new Error("Tag not found: {esc_tag}");
if (!parent) throw new Error("Parent tag not found: {esc_parent}");

// Collect tagged task/project IDs
var taskIds = [];
var tasks = doc.flattenedTasks();
for (var i = 0; i < tasks.length; i++) {{
    var tt = tasks[i].tags();
    for (var j = 0; j < tt.length; j++) {{
        if (tt[j].id() === tag.id()) {{ taskIds.push(tasks[i].id()); break; }}
    }}
}}
// Collect children names
var childNames = [];
var children = tag.tags();
for (var i = 0; i < children.length; i++) {{ childNames.push(children[i].name()); }}

// Delete old tag
tag.delete();

// Recreate under parent
var newTag = app.Tag({{name: "{esc_tag}"}});
parent.tags.push(newTag);

// Recreate children
for (var i = 0; i < childNames.length; i++) {{
    newTag.tags.push(app.Tag({{name: childNames[i]}}));
}}

// Reassign tasks
tags = doc.flattenedTags();
var fresh = null;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}") {{ fresh = tags[i]; break; }}
}}
if (fresh) {{
    for (var i = 0; i < taskIds.length; i++) {{
        var t = doc.flattenedTasks.whose({{id: taskIds[i]}})()[0];
        if (t) t.tags.push(fresh);
    }}
}}
JSON.stringify({{moved: true, tasks_reassigned: taskIds.length, children: childNames.length}});
"""
        _run_jxa(script)

    def create_tag(self, tag_name: str) -> None:
        """Create an OmniFocus tag.  Idempotent -- no-op if it already exists."""
        esc = _escape(tag_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var tags = doc.flattenedTags();
var exists = false;
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc}") {{
        exists = true;
        break;
    }}
}}
if (!exists) {{
    var tag = app.Tag({{name: "{esc}"}});
    doc.tags.push(tag);
}}
'ok';
"""
        _run_jxa(script)

    def tag_project(self, project_name: str, tag_name: str) -> None:
        """Add a tag to a project by name.  Creates the tag if needed.  Idempotent."""
        esc_proj = _escape(project_name)
        esc_tag = _escape(tag_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;

// Find project
var proj = null;
var projects = doc.flattenedProjects();
for (var i = 0; i < projects.length; i++) {{
    if (projects[i].name() === "{esc_proj}") {{
        proj = projects[i];
        break;
    }}
}}
if (!proj) throw new Error("Project not found: {esc_proj}");

// Find or create tag
var tag = null;
var tags = doc.flattenedTags();
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}") {{
        tag = tags[i];
        break;
    }}
}}
if (!tag) {{
    tag = app.Tag({{name: "{esc_tag}"}});
    doc.tags.push(tag);
}}

// Add tag if not already present
var projTags = proj.tags();
var hasTag = false;
for (var i = 0; i < projTags.length; i++) {{
    if (projTags[i].name() === "{esc_tag}") {{
        hasTag = true;
        break;
    }}
}}
if (!hasTag) {{
    app.add(tag, {{to: proj.tags}});
}}
'ok';
"""
        _run_jxa(script)

    def untag_project(self, project_name: str, tag_name: str) -> None:
        """Remove a tag from a project.  No-op if tag not present."""
        esc_proj = _escape(project_name)
        esc_tag = _escape(tag_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;

var proj = null;
var projects = doc.flattenedProjects();
for (var i = 0; i < projects.length; i++) {{
    if (projects[i].name() === "{esc_proj}") {{
        proj = projects[i];
        break;
    }}
}}
if (!proj) throw new Error("Project not found: {esc_proj}");

var projTags = proj.tags();
for (var i = 0; i < projTags.length; i++) {{
    if (projTags[i].name() === "{esc_tag}") {{
        app.remove(projTags[i], {{from: proj.tags}});
        break;
    }}
}}
'ok';
"""
        _run_jxa(script)

    def tag_task(self, task_id: str, tag_name: str) -> None:
        """Add a tag to a task by ID.  Creates the tag if needed.  Idempotent."""
        esc_id = _escape(task_id)
        esc_tag = _escape(tag_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;

var tasks = doc.flattenedTasks.whose({{id: "{esc_id}"}})();
if (tasks.length === 0) throw new Error("Task not found");
var task = tasks[0];

// Find or create tag
var tag = null;
var tags = doc.flattenedTags();
for (var i = 0; i < tags.length; i++) {{
    if (tags[i].name() === "{esc_tag}") {{
        tag = tags[i];
        break;
    }}
}}
if (!tag) {{
    tag = app.Tag({{name: "{esc_tag}"}});
    doc.tags.push(tag);
}}

// Add tag if not already present
var taskTags = task.tags();
var hasTag = false;
for (var i = 0; i < taskTags.length; i++) {{
    if (taskTags[i].name() === "{esc_tag}") {{
        hasTag = true;
        break;
    }}
}}
if (!hasTag) {{
    app.add(tag, {{to: task.tags}});
}}
'ok';
"""
        _run_jxa(script)

    def untag_task(self, task_id: str, tag_name: str) -> None:
        """Remove a tag from a task.  No-op if tag not present."""
        esc_id = _escape(task_id)
        esc_tag = _escape(tag_name)
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;

var tasks = doc.flattenedTasks.whose({{id: "{esc_id}"}})();
if (tasks.length === 0) throw new Error("Task not found");
var task = tasks[0];

var taskTags = task.tags();
for (var i = 0; i < taskTags.length; i++) {{
    if (taskTags[i].name() === "{esc_tag}") {{
        app.remove(taskTags[i], {{from: task.tags}});
        break;
    }}
}}
'ok';
"""
        _run_jxa(script)

    def open_project(self, name: str) -> None:
        """Open a project in OmniFocus front window by name."""
        esc = _escape(name)
        # Get the project ID via JXA
        script = f"""\
var app = Application("OmniFocus");
var doc = app.defaultDocument;
var projects = doc.flattenedProjects();
var foundId = "";
for (var i = 0; i < projects.length; i++) {{
    if (projects[i].name() === "{esc}") {{
        foundId = projects[i].id();
        break;
    }}
}}
foundId;
"""
        project_id = _run_jxa(script).strip()
        if not project_id:
            raise OmniFocusError(f"Project not found: {name}")
        # Open via URL scheme — more reliable than JXA window manipulation
        subprocess.run(["open", f"omnifocus:///task/{project_id}"], check=True)
