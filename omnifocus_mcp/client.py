"""OmniFocus client — JXA bridge for reading and writing OmniFocus data.

Each method builds a JavaScript for Automation (JXA) script, executes it
via ``osascript -l JavaScript``, and parses the JSON result.
"""

from __future__ import annotations

import json
import subprocess
import tempfile
import os


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
    ) -> list[dict]:
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
        return _run_jxa_json(script)

    def get_projects(self) -> list[dict]:
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
        return _run_jxa_json(script)

    def get_contexts(self) -> list[dict]:
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
        return _run_jxa_json(script)

    def get_folders(self) -> list[dict]:
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
        return _run_jxa_json(script)
