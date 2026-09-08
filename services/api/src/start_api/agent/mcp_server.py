"""StarT literature tools exposed as an MCP Streamable HTTP server (serverName: start)."""

from __future__ import annotations

import json
from typing import Any

from fastmcp import FastMCP

from start_api.agent.tools import dispatch_tool

mcp = FastMCP("start")


def _json_result(name: str, arguments: dict[str, Any] | None = None) -> str:
    return json.dumps(dispatch_tool(name, arguments or {}), ensure_ascii=False, default=str)


@mcp.tool
def health_check() -> str:
    """Check MinerU / translate / LLM readiness."""
    return _json_result("health_check")


@mcp.tool
def library_search(query: str = "", limit: int = 20) -> str:
    """Search the local paper library by keyword (FTS) or list recent uploads when query is empty."""
    return _json_result("library_search", {"query": query, "limit": limit})


@mcp.tool
def library_get(upload_id: str) -> str:
    """Get upload + bibliographic metadata for one paper."""
    return _json_result("library_get", {"upload_id": upload_id})


@mcp.tool
def library_update(
    upload_id: str,
    title: str | None = None,
    authors: list[str] | None = None,
    year: int | None = None,
    doi: str | None = None,
    abstract: str | None = None,
    venue: str | None = None,
    venue_type: str | None = None,
    arxiv_id: str | None = None,
    folder: str | None = None,
    favorited: bool | None = None,
    tags: list[str] | None = None,
) -> str:
    """Update bibliographic metadata for a paper.

    Supports title, authors, year, doi, abstract, venue, venue_type
    (journal|conference|preprint|other), arxiv_id, folder, favorited, tags.
    """
    args: dict[str, Any] = {"upload_id": upload_id}
    if title is not None:
        args["title"] = title
    if authors is not None:
        args["authors"] = authors
    if year is not None:
        args["year"] = year
    if doi is not None:
        args["doi"] = doi
    if abstract is not None:
        args["abstract"] = abstract
    if venue is not None:
        args["venue"] = venue
    if venue_type is not None:
        args["venue_type"] = venue_type
    if arxiv_id is not None:
        args["arxiv_id"] = arxiv_id
    if folder is not None:
        args["folder"] = folder
    if favorited is not None:
        args["favorited"] = favorited
    if tags is not None:
        args["tags"] = tags
    return _json_result("library_update", args)


@mcp.tool
def upload_from_url(url: str) -> str:
    """Download a PDF from arXiv / DOI / direct URL and register it in the library."""
    return _json_result("upload_from_url", {"url": url})


@mcp.tool
def parse_document(
    upload_id: str,
    translate: bool = False,
    wait: bool = True,
    parse_backend: str = "hybrid-engine",
) -> str:
    """Start MinerU layout parse for an upload. Waits until done by default."""
    return _json_result(
        "parse_document",
        {
            "upload_id": upload_id,
            "translate": translate,
            "wait": wait,
            "parse_backend": parse_backend,
        },
    )


@mcp.tool
def translate_document(
    upload_id: str | None = None,
    task_id: str | None = None,
    wait: bool = True,
) -> str:
    """Translate an already-parsed document (EN→ZH). Provide upload_id or task_id."""
    args: dict[str, Any] = {"wait": wait}
    if upload_id is not None:
        args["upload_id"] = upload_id
    if task_id is not None:
        args["task_id"] = task_id
    return _json_result("translate_document", args)


@mcp.tool
def get_task_status(task_id: str) -> str:
    """Poll a parse/translate task status."""
    return _json_result("get_task_status", {"task_id": task_id})


@mcp.tool
def get_paper_text(upload_id: str, source: str = "en") -> str:
    """Read truncated markdown for a paper (en or zh)."""
    return _json_result("get_paper_text", {"upload_id": upload_id, "source": source})


@mcp.tool
def export_citation(upload_id: str, format: str = "bibtex") -> str:
    """Export BibTeX or RIS citation for a paper."""
    return _json_result("export_citation", {"upload_id": upload_id, "format": format})


def create_mcp_http_app():
    """ASGI app for mounting at ``/mcp`` (path ``/`` to avoid double prefix)."""
    return mcp.http_app(path="/")
