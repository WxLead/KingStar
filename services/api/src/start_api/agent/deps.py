"""Injected domain operations so agent tools avoid circular imports with main."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class AgentDeps:
    health: Callable[[], dict[str, Any]]
    list_uploads: Callable[[], list[dict[str, Any]]]
    get_upload: Callable[[str], dict[str, Any] | None]
    upload_from_url: Callable[[str], dict[str, Any]]
    create_parse_task: Callable[..., dict[str, Any]]
    create_translate_task: Callable[..., dict[str, Any]]
    get_task: Callable[[str], dict[str, Any] | None]
    get_paper: Callable[[str], dict[str, Any] | None]
    patch_paper: Callable[[str, dict[str, Any]], dict[str, Any]]
    search_library: Callable[[str, int], dict[str, Any]]
    export_citation: Callable[[str, str], str]
    read_paper_markdown: Callable[[str, str], str]
    resolve_upload_id_for_task: Callable[[str], str | None]


_deps: AgentDeps | None = None


def configure_agent(deps: AgentDeps) -> None:
    global _deps
    _deps = deps


def get_agent_deps() -> AgentDeps:
    if _deps is None:
        raise RuntimeError("Agent deps not configured; call configure_agent() from main")
    return _deps
