"""KingStar translate package: MinerU Markdown EN→ZH + PDF export."""

from __future__ import annotations

from typing import Any

# Import callable API under names that do NOT collide with submodule
# `start_translate.export_pdf` (the .py module). Eagerly binding `export_pdf`
# here gets overwritten when that submodule is loaded.
from start_translate.api import (
    beautify_and_export,
    run_direct,
    translate_markdown,
)
from start_translate.api import export_pdf as _export_pdf_fn

__all__ = [
    "translate_markdown",
    "export_pdf",
    "beautify_and_export",
    "run_direct",
]


def export_pdf(*args: Any, **kwargs: Any):
    """Always delegate to api.export_pdf (never the export_pdf.py module)."""
    return _export_pdf_fn(*args, **kwargs)


def __getattr__(name: str):
    if name == "export_pdf":
        return _export_pdf_fn
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
