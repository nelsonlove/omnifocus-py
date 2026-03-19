# Split Library/CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure omnifocus-py into separate library (`omnifocus`) and CLI (`omnifocus_cli`) packages under `src/`, matching the apple-music-py architecture.

**Architecture:** Move all library code (client, models, server) into `src/omnifocus/` and CLI code into `src/omnifocus_cli/`. Both packages ship in one wheel. The library has zero Click imports; the CLI imports from the library.

**Tech Stack:** Python 3.10+, Click, hatchling, FastMCP (optional)

---

### Task 1: Create directory structure and move library files

**Files:**
- Create: `src/omnifocus/__init__.py`
- Create: `src/omnifocus_cli/__init__.py`
- Move: `omnifocus/client.py` → `src/omnifocus/client.py`
- Move: `omnifocus/models.py` → `src/omnifocus/models.py`
- Move: `omnifocus/server.py` → `src/omnifocus/server.py`
- Move: `omnifocus/cli.py` → `src/omnifocus_cli/cli.py`
- Delete: `omnifocus/` (old package directory)

**Step 1: Create `src/` directories**

```bash
mkdir -p src/omnifocus src/omnifocus_cli
```

**Step 2: Move library files**

```bash
mv omnifocus/client.py src/omnifocus/client.py
mv omnifocus/models.py src/omnifocus/models.py
mv omnifocus/server.py src/omnifocus/server.py
```

**Step 3: Move CLI file**

```bash
mv omnifocus/cli.py src/omnifocus_cli/cli.py
```

**Step 4: Write `src/omnifocus/__init__.py`**

```python
"""OmniFocus — Python library for OmniFocus on macOS."""

from .client import OmniFocusClient, OmniFocusError
from .models import Folder, Project, Tag, Task

__all__ = ["OmniFocusClient", "OmniFocusError", "Task", "Project", "Tag", "Folder"]
```

**Step 5: Write `src/omnifocus_cli/__init__.py`**

```python
"""OmniFocus CLI — command-line interface for OmniFocus."""
```

**Step 6: Remove old package directory**

```bash
rm -rf omnifocus/
```

**Step 7: Commit**

```bash
git add -A
git commit -m "Move source files into src/ layout with split packages"
```

---

### Task 2: Update CLI imports to use library package

**Files:**
- Modify: `src/omnifocus_cli/cli.py` (line 9)

**Step 1: Fix the import**

Change line 9 from:
```python
from .client import OmniFocusClient, OmniFocusError
```
to:
```python
from omnifocus import OmniFocusClient, OmniFocusError
```

This is the key architectural change — the CLI imports the library as an external package, not a relative import.

**Step 2: Commit**

```bash
git add src/omnifocus_cli/cli.py
git commit -m "Update CLI imports to use library package"
```

---

### Task 3: Update pyproject.toml

**Files:**
- Modify: `pyproject.toml`

**Step 1: Update pyproject.toml to this:**

```toml
[project]
name = "omnifocus-py"
version = "3.0.0"
description = "Python library, CLI, and MCP server for OmniFocus"
requires-python = ">=3.10"
dependencies = ["click>=8.1"]
license = "MIT"
authors = [{ name = "Nelson Love" }]

[project.optional-dependencies]
mcp = ["mcp>=1.0"]
dev = [
    "pytest>=8.0",
    "ruff>=0.1",
    "mypy>=1.0",
]

[project.scripts]
omnifocus = "omnifocus_cli.cli:cli"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/omnifocus", "src/omnifocus_cli"]

[tool.pytest.ini_options]
pythonpath = ["src"]
```

Changes from original:
- `[project.scripts]`: `omnifocus.cli:cli` → `omnifocus_cli.cli:cli`
- `[tool.hatch.build.targets.wheel]`: `["omnifocus"]` → `["src/omnifocus", "src/omnifocus_cli"]`
- Added `[tool.pytest.ini_options]` with `pythonpath = ["src"]`

**Step 2: Reinstall the package**

```bash
uv sync --extra mcp --extra dev
```

**Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "Update pyproject.toml for split src/ layout"
```

---

### Task 4: Verify everything works

**Step 1: Verify library import**

```bash
uv run python -c "from omnifocus import OmniFocusClient, OmniFocusError, Task, Project, Tag, Folder; print('Library OK')"
```

Expected: `Library OK`

**Step 2: Verify CLI**

```bash
uv run omnifocus --help
```

Expected: Help text with commands (tasks, projects, tags, folders, create-task, complete)

**Step 3: Verify MCP server import**

```bash
uv run python -c "from omnifocus.server import main; print('MCP server OK')"
```

Expected: `MCP server OK`

**Step 4: Verify JSON mode works end-to-end**

```bash
uv run omnifocus --json projects
```

Expected: JSON envelope with `{"status": "ok", "data": [...]}`

**Step 5: Commit verification (no code change — just confirm)**

No commit needed. If anything fails, fix it before proceeding.

---

### Task 5: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the architecture section to reflect new structure:**

```markdown
## Architecture

\```
src/
  omnifocus/         ← Pure library (no CLI dependencies)
    client.py        OmniFocusClient: unified API via JXA bridge
    models.py        Data classes: Task, Project, Tag, Folder
    server.py        FastMCP server (calls OmniFocusClient)
  omnifocus_cli/     ← CLI package (consumes omnifocus library)
    cli.py           Click CLI (calls OmniFocusClient)
plugin/
  claude-code/       ← Claude Code plugin (calls CLI --json)
\```

Dependency direction: `plugin → CLI (omnifocus_cli) → Library (omnifocus) → JXA/osascript`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md for split library/CLI architecture"
```

---

### Task 6: Clean up old design doc

**Step 1: Remove the earlier design doc (superseded by this plan)**

```bash
rm docs/plans/2026-03-19-split-library-cli-design.md
```

**Step 2: Commit**

```bash
git add -A
git commit -m "Remove superseded design doc"
```
