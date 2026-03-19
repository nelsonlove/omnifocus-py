"""Data classes for OmniFocus objects."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Task:
    """An OmniFocus task."""

    id: str
    name: str
    note: str = ""
    flagged: bool = False
    completed: bool = False
    defer_date: str | None = None
    due_date: str | None = None
    project: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass
class Project:
    """An OmniFocus project."""

    id: str
    name: str
    note: str = ""
    status: str = "active"
    folder: str | None = None
    due_date: str | None = None
    completion_date: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass
class Tag:
    """An OmniFocus tag (context)."""

    id: str
    name: str
    parent_tag: str | None = None
    child_tags: list[str] = field(default_factory=list)


@dataclass
class Folder:
    """An OmniFocus folder."""

    id: str
    name: str
    parent_folder: str | None = None
    projects: list[str] = field(default_factory=list)
    subfolders: list[str] = field(default_factory=list)
