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
