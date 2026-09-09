"""Derive L1 web artifacts from dsh web_fetch tool results."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from start_api.agent import artifacts
from start_api.agent.harness_gateway import push_turn_sse


def _looks_like_web_fetch(tool_name: str) -> bool:
    n = (tool_name or "").lower()
    return "web_fetch" in n or n.endswith("fetch") and "web" in n


def _extract_text(result: Any) -> str:
    if result is None:
        return ""
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        if isinstance(result.get("data"), str):
            return result["data"]
        if isinstance(result.get("content"), str):
            return result["content"]
        if isinstance(result.get("text"), str):
            return result["text"]
        nested = result.get("data")
        if isinstance(nested, dict):
            for k in ("text", "content", "markdown", "body"):
                if isinstance(nested.get(k), str):
                    return nested[k]
        # Last resort: compact JSON-ish dump truncated
        try:
            import json

            return json.dumps(result, ensure_ascii=False, default=str)[:8000]
        except Exception:  # noqa: BLE001
            return str(result)[:8000]
    return str(result)[:8000]


def _title_from(url: str, text: str, arguments: dict[str, Any]) -> str:
    for key in ("title", "name"):
        v = arguments.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()[:120]
    for line in (text or "").splitlines():
        s = line.strip()
        if s.startswith("# "):
            return s[2:].strip()[:120]
        if s:
            return s[:120]
    try:
        host = urlparse(url).netloc or url
        return host[:120] or "网页"
    except Exception:  # noqa: BLE001
        return "网页"


def maybe_register_web_artifact(
    session_id: str,
    turn_id: str,
    *,
    tool_name: str,
    arguments: dict[str, Any],
    result: Any,
) -> dict[str, Any] | None:
    if not _looks_like_web_fetch(tool_name):
        return None
    url = ""
    for key in ("url", "uri", "href"):
        v = arguments.get(key)
        if isinstance(v, str) and v.strip():
            url = v.strip()
            break
    if not url and isinstance(result, dict):
        data = result.get("data") if isinstance(result.get("data"), dict) else result
        if isinstance(data, dict):
            for key in ("url", "uri", "href"):
                v = data.get(key)
                if isinstance(v, str) and v.strip():
                    url = v.strip()
                    break
    text = _extract_text(result).strip()
    if not url and not text:
        return None
    # Stable-ish id per URL within session so refetches update the same card.
    import hashlib

    digest = hashlib.sha1((session_id + "|" + (url or text[:80])).encode("utf-8")).hexdigest()[:16]
    aid = f"web-{digest}"
    title = _title_from(url, text, arguments)
    excerpt = text[:12000]
    art = artifacts.upsert_artifact(
        session_id,
        kind="web",
        title=title,
        status="ready",
        content=excerpt,
        uri=url or None,
        turn_id=turn_id,
        artifact_id=aid,
        meta={"source_tool": tool_name},
        replace_content=True,
    )
    view = artifacts.public_view(art, include_content=True)
    push_turn_sse("artifact_upsert", view, persist=False)
    return art
