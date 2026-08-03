"""Normalize MinerU API payloads into product ParseResult."""

from __future__ import annotations

import json
from typing import Any

from start_parse.schemas import ParseResult


def _pick_first_md(results: dict[str, Any]) -> str:
    """MinerU often returns {filename: {md_content: ...}} or similar."""
    if not results:
        return ""
    if isinstance(results.get("md_content"), str):
        return results["md_content"]
    for value in results.values():
        if isinstance(value, dict):
            for key in ("md_content", "markdown", "md"):
                if isinstance(value.get(key), str):
                    return value[key]
        if isinstance(value, str) and value.strip().startswith("#"):
            return value
    return ""


def _pick_json_field(results: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in results and results[key] is not None:
            return results[key]
    for value in results.values():
        if isinstance(value, dict):
            for key in keys:
                if key in value and value[key] is not None:
                    return value[key]
    return None


def normalize_mineru_response(
    payload: dict[str, Any],
    *,
    job_id: str,
    backend: str = "hybrid-engine",
    source_filename: str = "",
) -> ParseResult:
    """Accept sync /file_parse JSON or unzipped task result dict."""
    results = payload.get("results") if isinstance(payload.get("results"), dict) else payload
    if not isinstance(results, dict):
        results = {}

    markdown = _pick_first_md(results)
    middle = _pick_json_field(results, "middle_json", "middle")
    if isinstance(middle, str):
        try:
            middle = json.loads(middle)
        except json.JSONDecodeError:
            pass

    content_list = _pick_json_field(results, "content_list", "content_list_json")
    if isinstance(content_list, str):
        try:
            content_list = json.loads(content_list)
        except json.JSONDecodeError:
            pass

    images: dict[str, str] = {}
    raw_images = _pick_json_field(results, "images")
    if isinstance(raw_images, dict):
        images = {str(k): str(v) for k, v in raw_images.items()}

    pages = None
    if isinstance(middle, dict):
        pdf_info = middle.get("pdf_info")
        if isinstance(pdf_info, list):
            pages = len(pdf_info)

    return ParseResult(
        job_id=job_id,
        markdown=markdown,
        middle_json=middle if isinstance(middle, dict) else None,
        content_list=content_list if isinstance(content_list, (list, dict)) else None,
        images=images,
        meta={
            "backend": backend,
            "pages": pages,
            "source": "mineru",
            "filename": source_filename,
            "raw_keys": list(results.keys())[:20],
        },
    )
