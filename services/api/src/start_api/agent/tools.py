"""Typed tool implementations for the research Agent."""

from __future__ import annotations

import json
import time
from typing import Any

from start_api.agent.deps import get_agent_deps

TASK_POLL_SECONDS = 600
POLL_INTERVAL = 1.5


def _ok(data: Any = None, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": True, "data": data}
    out.update(extra)
    return out


def _err(message: str, **extra: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"ok": False, "error": message}
    out.update(extra)
    return out


def _wait_task(task_id: str, *, timeout: float = TASK_POLL_SECONDS) -> dict[str, Any]:
    deps = get_agent_deps()
    deadline = time.monotonic() + timeout
    last: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        task = deps.get_task(task_id)
        if not task:
            return _err(f"task not found: {task_id}")
        last = task
        status = task.get("status")
        if status == "done":
            return _ok(
                {
                    "task_id": task_id,
                    "status": status,
                    "upload_id": task.get("upload_id"),
                    "filename": task.get("filename"),
                    "result": task.get("result"),
                    "progress": task.get("progress"),
                }
            )
        if status == "failed":
            return _err(
                task.get("error") or "task failed",
                data={
                    "task_id": task_id,
                    "status": status,
                    "upload_id": task.get("upload_id"),
                    "progress": task.get("progress"),
                },
            )
        time.sleep(POLL_INTERVAL)
    return _err(
        f"task timed out after {int(timeout)}s (still {last.get('status') if last else 'unknown'})",
        data={"task_id": task_id, "last": last},
    )


def health_check() -> dict[str, Any]:
    return _ok(get_agent_deps().health())


def library_search(query: str = "", limit: int = 20) -> dict[str, Any]:
    deps = get_agent_deps()
    lim = max(1, min(int(limit or 20), 50))
    q = (query or "").strip()
    if q:
        found = deps.search_library(q, lim)
        ids = list(found.get("upload_ids") or [])
    else:
        ids = [u["upload_id"] for u in deps.list_uploads()[:lim]]

    items: list[dict[str, Any]] = []
    for uid in ids[:lim]:
        upload = deps.get_upload(uid) or {"upload_id": uid}
        paper = deps.get_paper(uid) or {}
        items.append(
            {
                "upload_id": uid,
                "filename": upload.get("filename"),
                "title": paper.get("title") or upload.get("title") or upload.get("filename"),
                "authors": paper.get("authors") or upload.get("authors") or [],
                "year": paper.get("year") or upload.get("year"),
                "pipeline_stage": upload.get("pipeline_stage"),
                "last_task_id": upload.get("last_task_id"),
                "has_zh": upload.get("has_zh"),
                "favorited": bool(paper.get("favorited") or upload.get("favorited")),
            }
        )
    return _ok({"query": q, "count": len(items), "items": items})


def library_get(upload_id: str) -> dict[str, Any]:
    deps = get_agent_deps()
    uid = (upload_id or "").strip()
    if not uid:
        return _err("upload_id is required")
    upload = deps.get_upload(uid)
    if not upload:
        return _err(f"upload not found: {uid}")
    paper = deps.get_paper(uid) or {}
    return _ok({"upload": upload, "paper": paper})


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
) -> dict[str, Any]:
    deps = get_agent_deps()
    uid = (upload_id or "").strip()
    if not uid:
        return _err("upload_id is required")
    if not deps.get_upload(uid):
        return _err(f"upload not found: {uid}")
    patch: dict[str, Any] = {}
    if title is not None:
        patch["title"] = title
    if authors is not None:
        patch["authors"] = authors
    if year is not None:
        patch["year"] = year
    if doi is not None:
        patch["doi"] = doi
    if abstract is not None:
        patch["abstract"] = abstract
    if venue is not None:
        patch["venue"] = venue
    if venue_type is not None:
        vt = str(venue_type).strip().lower()
        if vt not in {"journal", "conference", "preprint", "other"}:
            return _err("venue_type must be journal|conference|preprint|other")
        patch["venue_type"] = vt
    if arxiv_id is not None:
        patch["arxiv_id"] = arxiv_id
    if folder is not None:
        patch["folder"] = folder
    if favorited is not None:
        patch["favorited"] = favorited
    if tags is not None:
        patch["tags"] = tags
    if not patch:
        return _err("no fields to update")
    paper = deps.patch_paper(uid, patch)
    return _ok({"upload_id": uid, "paper": paper})


def upload_from_url(url: str) -> dict[str, Any]:
    deps = get_agent_deps()
    raw = (url or "").strip()
    if not raw:
        return _err("url is required")
    try:
        meta = deps.upload_from_url(raw)
        return _ok(meta)
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)


def parse_document(
    upload_id: str,
    translate: bool = False,
    wait: bool = True,
    parse_backend: str = "hybrid-engine",
) -> dict[str, Any]:
    deps = get_agent_deps()
    uid = (upload_id or "").strip()
    if not uid:
        return _err("upload_id is required")
    if not deps.get_upload(uid):
        return _err(f"upload not found: {uid}")

    health = deps.health()
    if health.get("mineru") == "down" and not str(
        (deps.get_upload(uid) or {}).get("filename") or ""
    ).lower().endswith((".md", ".txt", ".markdown")):
        return _err(
            "MinerU 不可用（health.mineru=down）。请先启动 mineru-api，或仅对 .md/.txt 做直通解析。"
        )

    try:
        created = deps.create_parse_task(
            upload_id=uid,
            translate=bool(translate),
            parse_backend=parse_backend or "hybrid-engine",
        )
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)

    task_id = created["task_id"]
    if not wait:
        return _ok({"task_id": task_id, "status": "queued", "upload_id": uid, "waiting": False})
    return _wait_task(task_id)


def translate_document(upload_id: str | None = None, task_id: str | None = None, wait: bool = True) -> dict[str, Any]:
    deps = get_agent_deps()
    tid = (task_id or "").strip()
    uid = (upload_id or "").strip()

    if not tid and uid:
        upload = deps.get_upload(uid)
        if not upload:
            return _err(f"upload not found: {uid}")
        tid = str(upload.get("last_task_id") or "").strip()
        if not tid:
            return _err("该文献尚无解析任务，请先 parse_document")

    if not tid:
        return _err("task_id or upload_id is required")

    health = deps.health()
    if health.get("llm") == "unset":
        return _err("LLM 未配置，请到设置页填写 API Key")
    if health.get("translate") == "missing":
        return _err("翻译模块未安装（start_translate missing）")

    try:
        created = deps.create_translate_task(task_id=tid)
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)

    new_id = created["task_id"]
    if not wait:
        return _ok({"task_id": new_id, "status": "queued", "waiting": False})
    return _wait_task(new_id)


def get_task_status(task_id: str) -> dict[str, Any]:
    deps = get_agent_deps()
    tid = (task_id or "").strip()
    if not tid:
        return _err("task_id is required")
    task = deps.get_task(tid)
    if not task:
        return _err(f"task not found: {tid}")
    return _ok(
        {
            "task_id": tid,
            "status": task.get("status"),
            "upload_id": task.get("upload_id"),
            "filename": task.get("filename"),
            "error": task.get("error"),
            "progress": task.get("progress"),
            "result": task.get("result"),
        }
    )


def get_paper_text(upload_id: str) -> dict[str, Any]:
    """Read full original markdown (document.md) for a paper — never the ZH translation."""
    deps = get_agent_deps()
    uid = (upload_id or "").strip()
    if not uid:
        return _err("upload_id is required")
    try:
        text = deps.read_paper_markdown(uid, "en")
    except FileNotFoundError as exc:
        return _err(str(exc))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)
    body = (text or "").strip()
    return _ok(
        {
            "upload_id": uid,
            "source": "en",
            "truncated": False,
            "chars": len(body),
            "text": body,
        }
    )


def export_citation(upload_id: str, format: str = "bibtex") -> dict[str, Any]:
    deps = get_agent_deps()
    uid = (upload_id or "").strip()
    if not uid:
        return _err("upload_id is required")
    if not deps.get_upload(uid):
        return _err(f"upload not found: {uid}")
    fmt = (format or "bibtex").strip().lower()
    if fmt in {"bib", "biblatex"}:
        fmt = "bibtex"
    if fmt not in {"bibtex", "ris"}:
        return _err("format must be bibtex or ris")
    try:
        text = deps.export_citation(uid, fmt)
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)
    return _ok({"upload_id": uid, "format": fmt, "citation": text})


TOOL_HANDLERS: dict[str, Any] = {
    "health_check": health_check,
    "library_search": library_search,
    "library_get": library_get,
    "library_update": library_update,
    "upload_from_url": upload_from_url,
    "parse_document": parse_document,
    "translate_document": translate_document,
    "get_task_status": get_task_status,
    "get_paper_text": get_paper_text,
    "export_citation": export_citation,
}


def dispatch_tool(name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return _err(f"unknown tool: {name}")
    args = arguments or {}
    try:
        return handler(**args)
    except TypeError as exc:
        return _err(f"invalid arguments for {name}: {exc}")
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc) or exc.__class__.__name__)


def tool_result_for_model(result: dict[str, Any]) -> str:
    """JSON for the model context — keep full tool payloads (no truncation)."""
    return json.dumps(result, ensure_ascii=False, default=str)
