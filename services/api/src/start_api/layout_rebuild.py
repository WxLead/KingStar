"""Rebuild document.md from content_list.json (Plan A layout edit)."""

from __future__ import annotations

from typing import Any


def _content_item_to_markdown(item: dict[str, Any]) -> str | None:
    typ = item.get("type") or "text"
    if typ in {"aside_text", "header", "footer", "page_number"}:
        return None

    if typ == "image":
        parts: list[str] = []
        path = str(item.get("img_path") or "").replace("\\", "/").strip()
        if path:
            rel = path[2:] if path.startswith("./") else path
            if "/" not in rel:
                rel = f"images/{rel}"
            parts.append(f"![]({rel})")
        for c in list(item.get("image_caption") or []) + list(item.get("image_footnote") or []):
            if isinstance(c, str) and c.strip():
                parts.append(c.strip())
        return "\n\n".join(parts) if parts else None

    if typ == "table":
        parts = []
        for c in item.get("table_caption") or []:
            if isinstance(c, str) and c.strip():
                parts.append(c.strip())
        body = item.get("table_body")
        if isinstance(body, str) and body.strip():
            parts.append(body.strip())
        for c in item.get("table_footnote") or []:
            if isinstance(c, str) and c.strip():
                parts.append(c.strip())
        return "\n\n".join(parts) if parts else "*(表格)*"

    if typ == "equation":
        t = (item.get("text") or "").strip()
        return t or None

    text = (item.get("text") or "").strip()
    if not text:
        return None
    level = item.get("text_level")
    if isinstance(level, int) and level > 0:
        return f"{'#' * min(6, level)} {text}"
    return text


def rebuild_markdown_from_content_list(content_list: list[Any]) -> str:
    chunks: list[str] = []
    for item in content_list:
        if not isinstance(item, dict):
            continue
        md = _content_item_to_markdown(item)
        if md:
            chunks.append(md)
    return "\n\n".join(chunks).strip() + ("\n" if chunks else "")
