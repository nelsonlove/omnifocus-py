"""Tests for omnifocus.models dataclasses."""

from omnifocus.models import Folder, Project, Tag, Task


class TestTask:
    def test_minimal(self):
        t = Task(id="abc", name="Buy milk")
        assert t.id == "abc"
        assert t.name == "Buy milk"
        assert t.note == ""
        assert t.flagged is False
        assert t.completed is False
        assert t.defer_date is None
        assert t.due_date is None
        assert t.project is None
        assert t.tags == []

    def test_full(self):
        t = Task(
            id="t1",
            name="File taxes",
            note="Use TurboTax",
            flagged=True,
            completed=True,
            defer_date="2026-03-01T00:00:00Z",
            due_date="2026-04-15T00:00:00Z",
            project="Finance",
            tags=["urgent", "home"],
        )
        assert t.flagged is True
        assert t.completed is True
        assert t.due_date == "2026-04-15T00:00:00Z"
        assert t.project == "Finance"
        assert t.tags == ["urgent", "home"]

    def test_tags_default_not_shared(self):
        """Each instance gets its own tags list."""
        a = Task(id="a", name="A")
        b = Task(id="b", name="B")
        a.tags.append("x")
        assert b.tags == []


class TestProject:
    def test_minimal(self):
        p = Project(id="p1", name="Inbox")
        assert p.status == "active"
        assert p.folder is None
        assert p.due_date is None
        assert p.completion_date is None
        assert p.tags == []

    def test_full(self):
        p = Project(
            id="p2",
            name="Remodel",
            note="Kitchen remodel",
            status="on hold",
            folder="Home",
            due_date="2026-06-01",
            completion_date="2026-07-01",
            tags=["home"],
        )
        assert p.status == "on hold"
        assert p.folder == "Home"
        assert p.tags == ["home"]


class TestTag:
    def test_minimal(self):
        t = Tag(id="t1", name="waiting")
        assert t.parent_tag is None
        assert t.child_tags == []

    def test_with_hierarchy(self):
        t = Tag(id="t2", name="errands", parent_tag="personal", child_tags=["groceries", "pharmacy"])
        assert t.parent_tag == "personal"
        assert len(t.child_tags) == 2

    def test_child_tags_default_not_shared(self):
        a = Tag(id="a", name="A")
        b = Tag(id="b", name="B")
        a.child_tags.append("x")
        assert b.child_tags == []


class TestFolder:
    def test_minimal(self):
        f = Folder(id="f1", name="Work")
        assert f.parent_folder is None
        assert f.projects == []
        assert f.subfolders == []

    def test_full(self):
        f = Folder(
            id="f2",
            name="Personal",
            parent_folder="Top",
            projects=["Errands", "Health"],
            subfolders=["Finance"],
        )
        assert f.parent_folder == "Top"
        assert len(f.projects) == 2
        assert f.subfolders == ["Finance"]

    def test_lists_default_not_shared(self):
        a = Folder(id="a", name="A")
        b = Folder(id="b", name="B")
        a.projects.append("x")
        a.subfolders.append("y")
        assert b.projects == []
        assert b.subfolders == []
