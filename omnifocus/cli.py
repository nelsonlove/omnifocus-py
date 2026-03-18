"""Click CLI for OmniFocus — thin layer over OmniFocusClient."""

import json
import sys
from dataclasses import asdict

import click

from .client import OmniFocusClient, OmniFocusError


@click.group()
@click.option("--json", "as_json", is_flag=True, envvar="OMNIFOCUS_OUTPUT",
              help="Output as JSON (structured envelope).")
@click.pass_context
def cli(ctx, as_json):
    """Read, create, and manage OmniFocus tasks, projects, and tags."""
    ctx.ensure_object(dict)
    ctx.obj["client"] = OmniFocusClient()
    ctx.obj["json"] = as_json


def _client(ctx) -> OmniFocusClient:
    return ctx.obj["client"]


def _emit(ctx, data):
    """Emit structured JSON envelope."""
    click.echo(json.dumps({"status": "ok", "data": data}, indent=2, default=str))


def _emit_error(code: str, message: str):
    """Emit structured JSON error envelope."""
    click.echo(
        json.dumps({"status": "error", "error": {"code": code, "message": message}}, indent=2),
        err=True,
    )
    sys.exit(1)


# ── tasks ────────────────────────────────────────────────────────────────

@cli.command("tasks")
@click.option("--project", default=None, help="Filter by project name.")
@click.option("--tag", "context", default=None, help="Filter by tag name.")
@click.option("--flagged", is_flag=True, default=None, help="Only flagged tasks.")
@click.option("--completed", is_flag=True, default=False, help="Include completed tasks.")
@click.pass_context
def list_tasks(ctx, project, context, flagged, completed):
    """List tasks, optionally filtered."""
    client = _client(ctx)
    try:
        tasks = client.get_tasks(
            project=project, context=context,
            flagged=flagged if flagged else None,
            completed=completed,
        )
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, [asdict(t) for t in tasks])
        return

    if not tasks:
        click.echo("No tasks found.")
        return

    for t in tasks:
        flag = "*" if t.flagged else " "
        tags = f" [{', '.join(t.tags)}]" if t.tags else ""
        proj = f" ({t.project})" if t.project else ""
        due = f" due:{t.due_date[:10]}" if t.due_date else ""
        click.echo(f" {flag} {t.name}{proj}{tags}{due}")


# ── projects ─────────────────────────────────────────────────────────────

@cli.command("projects")
@click.pass_context
def list_projects(ctx):
    """List all projects."""
    client = _client(ctx)
    try:
        projects = client.get_projects()
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, [asdict(p) for p in projects])
        return

    if not projects:
        click.echo("No projects found.")
        return

    for p in projects:
        folder = f" [{p.folder}]" if p.folder else ""
        status = f" ({p.status})" if p.status != "active" else ""
        click.echo(f"  {p.name}{folder}{status}")


# ── tags ─────────────────────────────────────────────────────────────────

@cli.command("tags")
@click.pass_context
def list_tags(ctx):
    """List all tags (contexts)."""
    client = _client(ctx)
    try:
        tags = client.get_contexts()
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, [asdict(t) for t in tags])
        return

    if not tags:
        click.echo("No tags found.")
        return

    for t in tags:
        parent = f" (under {t.parent_tag})" if t.parent_tag else ""
        children = f" → {', '.join(t.child_tags)}" if t.child_tags else ""
        click.echo(f"  {t.name}{parent}{children}")


# ── folders ──────────────────────────────────────────────────────────────

@cli.command("folders")
@click.pass_context
def list_folders(ctx):
    """List all folders."""
    client = _client(ctx)
    try:
        folders = client.get_folders()
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, [asdict(f) for f in folders])
        return

    if not folders:
        click.echo("No folders found.")
        return

    for f in folders:
        projs = f" ({len(f.projects)} projects)" if f.projects else ""
        parent = f" [in {f.parent_folder}]" if f.parent_folder else ""
        click.echo(f"  {f.name}{projs}{parent}")


# ── create-task ──────────────────────────────────────────────────────────

@cli.command("create-task")
@click.argument("name")
@click.option("--note", default=None, help="Task note.")
@click.option("--project", default=None, help="Assign to project.")
@click.option("--tag", "context", default=None, help="Assign tag.")
@click.option("--flagged", is_flag=True, default=False, help="Flag the task.")
@click.option("--due", "due_date", default=None, help="Due date (ISO format).")
@click.option("--defer", "defer_date", default=None, help="Defer date (ISO format).")
@click.option("--dry-run", is_flag=True, help="Show what would be created.")
@click.pass_context
def create_task_cmd(ctx, name, note, project, context, flagged, due_date, defer_date, dry_run):
    """Create a new task."""
    if dry_run:
        if ctx.obj["json"]:
            _emit(ctx, {"action": "create_task", "name": name})
        else:
            click.echo(f"Would create task: {name}")
        return

    client = _client(ctx)
    try:
        result = client.create_task(
            name=name, note=note, project=project, context=context,
            flagged=flagged if flagged else None,
            due_date=due_date, defer_date=defer_date,
        )
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, result)
    else:
        click.echo(f"Created task: {name}")


# ── complete ─────────────────────────────────────────────────────────────

@cli.command("complete")
@click.argument("task_id")
@click.option("--dry-run", is_flag=True, help="Show what would be completed.")
@click.pass_context
def complete_task_cmd(ctx, task_id, dry_run):
    """Mark a task as complete by ID."""
    if dry_run:
        if ctx.obj["json"]:
            _emit(ctx, {"action": "complete", "task_id": task_id})
        else:
            click.echo(f"Would complete task: {task_id}")
        return

    client = _client(ctx)
    try:
        result = client.complete_task(task_id)
    except OmniFocusError as e:
        if ctx.obj["json"]:
            _emit_error("omnifocus_error", str(e))
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)

    if ctx.obj["json"]:
        _emit(ctx, result)
    else:
        click.echo(f"Completed: {result.get('name', task_id)}")
