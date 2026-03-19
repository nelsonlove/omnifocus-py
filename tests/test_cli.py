"""Tests for omnifocus_cli.cli — mock OmniFocusClient, verify JSON envelope."""

import json
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from omnifocus.models import Folder, Project, Tag, Task
from omnifocus_cli.cli import cli


@pytest.fixture
def runner():
    return CliRunner()


@pytest.fixture
def mock_client():
    with patch("omnifocus_cli.cli.OmniFocusClient") as MockCls:
        client = MagicMock()
        MockCls.return_value = client
        yield client


def _parse(result):
    """Parse JSON from CLI output, assert envelope shape."""
    assert result.exit_code == 0, f"CLI failed: {result.output}"
    data = json.loads(result.output)
    assert data["status"] == "ok"
    return data["data"]


# ── tasks ────────────────────────────────────────────────────────────────


class TestListTasks:
    def test_json_envelope(self, runner, mock_client):
        mock_client.get_tasks.return_value = [
            Task(id="t1", name="Buy milk", flagged=True, tags=["errands"]),
        ]
        result = runner.invoke(cli, ["--json", "tasks"])
        data = _parse(result)
        assert len(data) == 1
        assert data[0]["id"] == "t1"
        assert data[0]["name"] == "Buy milk"
        assert data[0]["flagged"] is True
        assert data[0]["tags"] == ["errands"]

    def test_empty_list(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        result = runner.invoke(cli, ["--json", "tasks"])
        data = _parse(result)
        assert data == []

    def test_filter_project(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        runner.invoke(cli, ["--json", "tasks", "--project", "Work"])
        mock_client.get_tasks.assert_called_once_with(
            project="Work", context=None, flagged=None, completed=False,
        )

    def test_filter_tag(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        runner.invoke(cli, ["--json", "tasks", "--tag", "urgent"])
        mock_client.get_tasks.assert_called_once_with(
            project=None, context="urgent", flagged=None, completed=False,
        )

    def test_filter_flagged(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        runner.invoke(cli, ["--json", "tasks", "--flagged"])
        mock_client.get_tasks.assert_called_once_with(
            project=None, context=None, flagged=True, completed=False,
        )

    def test_completed_flag(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        runner.invoke(cli, ["--json", "tasks", "--completed"])
        mock_client.get_tasks.assert_called_once_with(
            project=None, context=None, flagged=None, completed=None,
        )

    def test_only_completed(self, runner, mock_client):
        mock_client.get_tasks.return_value = []
        runner.invoke(cli, ["--json", "tasks", "--only-completed"])
        mock_client.get_tasks.assert_called_once_with(
            project=None, context=None, flagged=None, completed=True,
        )

    def test_plain_output(self, runner, mock_client):
        mock_client.get_tasks.return_value = [
            Task(id="t1", name="Buy milk"),
        ]
        result = runner.invoke(cli, ["tasks"])
        assert result.exit_code == 0
        assert "Buy milk" in result.output


# ── projects ─────────────────────────────────────────────────────────────


class TestListProjects:
    def test_json_envelope(self, runner, mock_client):
        mock_client.get_projects.return_value = [
            Project(id="p1", name="Inbox", status="active", folder="Work"),
        ]
        result = runner.invoke(cli, ["--json", "projects"])
        data = _parse(result)
        assert len(data) == 1
        assert data[0]["name"] == "Inbox"
        assert data[0]["folder"] == "Work"

    def test_empty(self, runner, mock_client):
        mock_client.get_projects.return_value = []
        result = runner.invoke(cli, ["--json", "projects"])
        data = _parse(result)
        assert data == []


# ── tags ─────────────────────────────────────────────────────────────────


class TestListTags:
    def test_json_envelope(self, runner, mock_client):
        mock_client.get_contexts.return_value = [
            Tag(id="tg1", name="waiting", child_tags=["blocked"]),
        ]
        result = runner.invoke(cli, ["--json", "tags"])
        data = _parse(result)
        assert len(data) == 1
        assert data[0]["name"] == "waiting"
        assert data[0]["child_tags"] == ["blocked"]

    def test_empty(self, runner, mock_client):
        mock_client.get_contexts.return_value = []
        result = runner.invoke(cli, ["--json", "tags"])
        data = _parse(result)
        assert data == []


# ── folders ──────────────────────────────────────────────────────────────


class TestListFolders:
    def test_json_envelope(self, runner, mock_client):
        mock_client.get_folders.return_value = [
            Folder(id="f1", name="Work", projects=["Alpha", "Beta"]),
        ]
        result = runner.invoke(cli, ["--json", "folders"])
        data = _parse(result)
        assert len(data) == 1
        assert data[0]["name"] == "Work"
        assert data[0]["projects"] == ["Alpha", "Beta"]

    def test_empty(self, runner, mock_client):
        mock_client.get_folders.return_value = []
        result = runner.invoke(cli, ["--json", "folders"])
        data = _parse(result)
        assert data == []


# ── create-task ──────────────────────────────────────────────────────────


class TestCreateTask:
    def test_dry_run_json(self, runner, mock_client):
        result = runner.invoke(cli, ["--json", "create-task", "Test task", "--dry-run"])
        data = _parse(result)
        assert data["action"] == "create_task"
        assert data["name"] == "Test task"
        mock_client.create_task.assert_not_called()

    def test_create_json(self, runner, mock_client):
        mock_client.create_task.return_value = {"id": "new1", "name": "Test task", "created": True}
        result = runner.invoke(cli, ["--json", "create-task", "Test task", "--project", "Work"])
        data = _parse(result)
        assert data["created"] is True
        mock_client.create_task.assert_called_once()

    def test_create_with_all_options(self, runner, mock_client):
        mock_client.create_task.return_value = {"id": "new2", "name": "X", "created": True}
        result = runner.invoke(cli, [
            "--json", "create-task", "X",
            "--note", "A note",
            "--project", "P",
            "--tag", "T",
            "--flagged",
            "--due", "2026-04-15",
            "--defer", "2026-04-01",
        ])
        data = _parse(result)
        assert data["created"] is True
        mock_client.create_task.assert_called_once_with(
            name="X", note="A note", project="P", context="T",
            flagged=True, due_date="2026-04-15", defer_date="2026-04-01",
        )


# ── complete ─────────────────────────────────────────────────────────────


class TestComplete:
    def test_dry_run_json(self, runner, mock_client):
        result = runner.invoke(cli, ["--json", "complete", "abc123", "--dry-run"])
        data = _parse(result)
        assert data["action"] == "complete"
        assert data["task_id"] == "abc123"
        mock_client.complete_task.assert_not_called()

    def test_complete_json(self, runner, mock_client):
        mock_client.complete_task.return_value = {"id": "abc123", "name": "Done", "completed": True}
        result = runner.invoke(cli, ["--json", "complete", "abc123"])
        data = _parse(result)
        assert data["completed"] is True
