"""MCP server for OmniFocus."""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP
from omnifocus_mcp.client import OmniFocusClient, OmniFocusError

mcp = FastMCP("OmniFocus", json_response=True)
client = OmniFocusClient()


# ------------------------------------------------------------------
# Read tools
# ------------------------------------------------------------------


@mcp.tool()
def get_tasks(
    project: str | None = None,
    context: str | None = None,
    flagged: bool | None = None,
    completed: bool = False,
) -> list[dict] | dict:
    """Get tasks from OmniFocus, optionally filtered by project, context/tag, flagged, or completion status."""
    try:
        return client.get_tasks(
            project=project, context=context, flagged=flagged, completed=completed
        )
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def get_projects() -> list[dict] | dict:
    """Get all projects from OmniFocus."""
    try:
        return client.get_projects()
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def get_contexts() -> list[dict] | dict:
    """Get all tags (contexts) from OmniFocus with parent/child relationships."""
    try:
        return client.get_contexts()
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def get_folders() -> list[dict] | dict:
    """Get all folders from OmniFocus with parent, projects, and subfolders."""
    try:
        return client.get_folders()
    except OmniFocusError as exc:
        return {"error": str(exc)}


# ------------------------------------------------------------------
# Write tools
# ------------------------------------------------------------------


@mcp.tool()
def create_task(
    name: str,
    note: str | None = None,
    project: str | None = None,
    parent_task_id: str | None = None,
    context: str | None = None,
    flagged: bool | None = None,
    due_date: str | None = None,
    defer_date: str | None = None,
) -> dict:
    """Create an OmniFocus task in the inbox, optionally assigning to a project, parent task, tag, flag, or dates."""
    try:
        return client.create_task(
            name=name,
            note=note,
            project=project,
            parent_task_id=parent_task_id,
            context=context,
            flagged=flagged,
            due_date=due_date,
            defer_date=defer_date,
        )
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def create_project(
    name: str,
    note: str | None = None,
    folder: str | None = None,
    status: str = "active",
    due_date: str | None = None,
    tags: list[str] | None = None,
) -> dict:
    """Create an OmniFocus project, optionally in a folder and with tags."""
    try:
        return client.create_project(
            name=name,
            note=note,
            folder=folder,
            status=status,
            due_date=due_date,
            tags=tags,
        )
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def update_task(
    task_id: str,
    name: str | None = None,
    note: str | None = None,
    flagged: bool | None = None,
    due_date: str | None = None,
    defer_date: str | None = None,
    project: str | None = None,
    context: str | None = None,
) -> dict:
    """Update fields on an existing OmniFocus task. Only provided fields are changed."""
    try:
        return client.update_task(
            task_id=task_id,
            name=name,
            note=note,
            flagged=flagged,
            due_date=due_date,
            defer_date=defer_date,
            project=project,
            context=context,
        )
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def update_project(
    project_id: str,
    name: str | None = None,
    note: str | None = None,
    status: str | None = None,
    due_date: str | None = None,
) -> dict:
    """Update fields on an existing OmniFocus project. Only provided fields are changed."""
    try:
        return client.update_project(
            project_id=project_id,
            name=name,
            note=note,
            status=status,
            due_date=due_date,
        )
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def complete_task(task_id: str) -> dict:
    """Mark an OmniFocus task as complete."""
    try:
        return client.complete_task(task_id=task_id)
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def delete_task(task_id: str) -> dict:
    """Delete an OmniFocus task."""
    try:
        return client.delete_task(task_id=task_id)
    except OmniFocusError as exc:
        return {"error": str(exc)}


# ------------------------------------------------------------------
# Tag tools
# ------------------------------------------------------------------


@mcp.tool()
def rename_tag(old_name: str, new_name: str) -> dict:
    """Rename an OmniFocus tag. Preserves hierarchy and all task associations."""
    try:
        client.rename_tag(old_name=old_name, new_name=new_name)
        return {"old_name": old_name, "new_name": new_name, "renamed": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def create_tag(tag_name: str) -> dict:
    """Create an OmniFocus tag. Idempotent -- no-op if it already exists."""
    try:
        client.create_tag(tag_name=tag_name)
        return {"tag": tag_name, "created": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def tag_project(project_name: str, tag_name: str) -> dict:
    """Add a tag to an OmniFocus project by name. Creates the tag if needed. Idempotent."""
    try:
        client.tag_project(project_name=project_name, tag_name=tag_name)
        return {"project": project_name, "tag": tag_name, "tagged": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def untag_project(project_name: str, tag_name: str) -> dict:
    """Remove a tag from an OmniFocus project. No-op if tag not present."""
    try:
        client.untag_project(project_name=project_name, tag_name=tag_name)
        return {"project": project_name, "tag": tag_name, "untagged": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def tag_task(task_id: str, tag_name: str) -> dict:
    """Add a tag to an OmniFocus task by ID. Creates the tag if needed. Idempotent."""
    try:
        client.tag_task(task_id=task_id, tag_name=tag_name)
        return {"task_id": task_id, "tag": tag_name, "tagged": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


@mcp.tool()
def untag_task(task_id: str, tag_name: str) -> dict:
    """Remove a tag from an OmniFocus task. No-op if tag not present."""
    try:
        client.untag_task(task_id=task_id, tag_name=tag_name)
        return {"task_id": task_id, "tag": tag_name, "untagged": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


# ------------------------------------------------------------------
# Utility tools
# ------------------------------------------------------------------


@mcp.tool()
def open_project(name: str) -> dict:
    """Open a project in the OmniFocus front window by name."""
    try:
        client.open_project(name=name)
        return {"project": name, "opened": True}
    except OmniFocusError as exc:
        return {"error": str(exc)}


def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
