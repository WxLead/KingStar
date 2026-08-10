"""Library routes: notes, paper metadata, tags, search."""

from __future__ import annotations

import json
from typing import Any, Callable

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, ConfigDict, Field

from start_api import db as store
from start_api.citations import CiteFormat, format_citation, format_many

router = APIRouter(prefix="/api/v1", tags=["library"])

# Injected from main to avoid circular imports
_resolve_md: Callable[[str], tuple[str, str, str]] | None = None
_list_upload_ids: Callable[[], list[str]] | None = None
# returns (filename, md_en, md_zh)


def configure_library(
    *,
    resolve_search_corpus: Callable[[str], tuple[str, str, str]],
    list_upload_ids: Callable[[], list[str]] | None = None,
) -> None:
    global _resolve_md, _list_upload_ids
    _resolve_md = resolve_search_corpus
    _list_upload_ids = list_upload_ids


class NotePut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    html: str = ""
    doc_json: Any | None = Field(default=None, alias="json")
    updated_at: int | None = None


class PaperPatch(BaseModel):
    title: str | None = None
    authors: list[str] | None = None
    year: int | None = None
    doi: str | None = None
    abstract: str | None = None
    venue: str | None = None
    venue_type: str | None = None
    folder: str | None = None
    favorited: bool | None = None
    tags: list[str] | None = None


class IdentifyRequest(BaseModel):
    force: bool = False


class TagsPut(BaseModel):
    tags: list[str] = Field(default_factory=list)


class FavoritePut(BaseModel):
    favorited: bool = True


class AnnotationsPut(BaseModel):
    items: list[Any] = Field(default_factory=list)
    updated_at: int | None = None


class CitationExportRequest(BaseModel):
    format: CiteFormat = "bibtex"
    upload_ids: list[str] | None = None


def _paper_for_cite(upload_id: str) -> dict[str, Any]:
    paper = store.get_paper(upload_id) or {"upload_id": upload_id}
    paper = dict(paper)
    paper.setdefault("upload_id", upload_id)
    if _resolve_md:
        try:
            filename, _, _ = _resolve_md(upload_id)
            if filename:
                paper.setdefault("filename", filename)
        except Exception:
            pass
    return paper


def _normalize_cite_format(raw: str) -> CiteFormat:
    f = (raw or "bibtex").strip().lower()
    if f in {"bib", "bibtex", "biblatex"}:
        return "bibtex"
    if f == "ris":
        return "ris"
    raise HTTPException(status_code=400, detail="format must be bibtex or ris")


@router.get("/uploads/{upload_id}/citation")
def get_upload_citation(
    upload_id: str,
    format: str = Query("bibtex", alias="format"),
) -> PlainTextResponse:
    fmt = _normalize_cite_format(format)
    text = format_citation(_paper_for_cite(upload_id), fmt)
    ext = "bib" if fmt == "bibtex" else "ris"
    return PlainTextResponse(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{upload_id[:8]}.{ext}"',
        },
    )


@router.post("/library/citations/export")
def export_library_citations(body: CitationExportRequest) -> PlainTextResponse:
    fmt: CiteFormat = body.format
    ids = body.upload_ids
    if ids is None:
        if not _list_upload_ids:
            raise HTTPException(status_code=500, detail="upload list not configured")
        ids = list(_list_upload_ids())
    papers = [_paper_for_cite(uid) for uid in ids]
    text = format_many(papers, fmt)
    ext = "bib" if fmt == "bibtex" else "ris"
    return PlainTextResponse(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="start-library.{ext}"',
        },
    )


@router.get("/uploads/{upload_id}/notes")
def get_notes(upload_id: str) -> dict[str, Any]:
    doc = store.get_note(upload_id)
    if not doc:
        return {"upload_id": upload_id, "html": "", "updated_at": 0, "json": None}
    return doc


@router.put("/uploads/{upload_id}/notes")
def put_notes(upload_id: str, body: NotePut) -> dict[str, Any]:
    doc = store.save_note(upload_id, body.html, body.doc_json, body.updated_at)
    _reindex_safe(upload_id)
    return doc


@router.get("/uploads/{upload_id}/annotations")
def get_annotations(upload_id: str) -> dict[str, Any]:
    return store.get_annotations(upload_id)


@router.put("/uploads/{upload_id}/annotations")
def put_annotations(upload_id: str, body: AnnotationsPut) -> dict[str, Any]:
    return store.save_annotations(upload_id, body.items, body.updated_at)


@router.get("/uploads/{upload_id}/library")
def get_library(upload_id: str) -> dict[str, Any]:
    paper = store.get_paper(upload_id)
    note = store.get_note(upload_id)
    base = paper or {
        "upload_id": upload_id,
        "title": None,
        "authors": [],
        "year": None,
        "doi": None,
        "abstract": None,
        "favorited": False,
        "favorited_at": None,
        "folder": None,
        "tags": [],
        "updated_at": None,
    }
    if note:
        j = note.get("json")
        jstr = json.dumps(j, ensure_ascii=False) if j is not None else None
        base["has_notes"] = store.note_has_content(note.get("html"), jstr)
    else:
        base["has_notes"] = False
    return base


@router.patch("/uploads/{upload_id}/library")
def patch_library(upload_id: str, body: PaperPatch) -> dict[str, Any]:
    patch = body.model_dump(exclude_unset=True)
    if any(k in patch for k in ("title", "authors", "year", "doi", "abstract", "venue", "venue_type")):
        patch.setdefault("metadata_source", "manual")
    paper = store.upsert_paper(upload_id, patch)
    _reindex_safe(upload_id)
    return paper


@router.post("/uploads/{upload_id}/identify")
def identify_upload(upload_id: str, body: IdentifyRequest | None = None) -> dict[str, Any]:
    force = bool(body.force) if body else False
    return run_identify(upload_id, force=force)


@router.put("/uploads/{upload_id}/tags")
def put_tags(upload_id: str, body: TagsPut) -> dict[str, Any]:
    paper = store.set_paper_tags(upload_id, body.tags)
    _reindex_safe(upload_id)
    return paper


@router.put("/uploads/{upload_id}/favorite")
def put_favorite(upload_id: str, body: FavoritePut) -> dict[str, Any]:
    paper = store.upsert_paper(upload_id, {"favorited": body.favorited})
    return paper


@router.get("/library/tags")
def list_tags() -> dict[str, Any]:
    return {"items": store.list_all_tags()}


@router.get("/library/search")
def library_search(q: str = "", limit: int = 100) -> dict[str, Any]:
    lim = max(1, min(limit, 500))
    ids = store.search_upload_ids(q, limit=lim)
    if q.strip() and _list_upload_ids and _resolve_md and len(ids) < lim:
        needle = q.strip().casefold()
        seen = set(ids)
        for uid in _list_upload_ids():
            if uid in seen:
                continue
            try:
                filename, _, _ = _resolve_md(uid)
            except Exception:
                continue
            if needle in (filename or "").casefold():
                ids.append(uid)
                seen.add(uid)
                if len(ids) >= lim:
                    break
    return {"query": q, "upload_ids": ids}


@router.post("/library/reindex")
def library_reindex() -> dict[str, Any]:
    if not _resolve_md:
        raise HTTPException(status_code=500, detail="search corpus resolver not configured")
    ids = set(store.list_indexed_upload_ids())
    if _list_upload_ids:
        ids |= set(_list_upload_ids())
    for uid in ids:
        _reindex_safe(uid)
    return {"ok": True, "indexed": len(ids)}


def _reindex_safe(upload_id: str) -> None:
    filename, md_en, md_zh = "", "", ""
    if _resolve_md:
        try:
            filename, md_en, md_zh = _resolve_md(upload_id)
        except Exception:
            pass
    try:
        store.reindex_paper(upload_id, filename=filename, md_en=md_en, md_zh=md_zh)
    except Exception:
        pass


def reindex_upload(upload_id: str) -> None:
    _reindex_safe(upload_id)


def run_identify(upload_id: str, *, force: bool = False) -> dict[str, Any]:
    """Identify bibliographic metadata and persist. Used by route + auto pipeline."""
    from start_api.metadata_identify import identify_from_text

    existing = store.get_paper(upload_id)
    if (
        not force
        and existing
        and existing.get("metadata_source")
        in {"crossref", "arxiv", "crossref-title", "ai", "ai-crossref", "ai-arxiv"}
        and existing.get("title")
    ):
        return {
            "ok": True,
            "skipped": True,
            "detail": "已识别过，跳过（可强制重新识别）",
            "paper": existing,
        }

    filename, md_en, md_zh = "", "", ""
    if _resolve_md:
        try:
            filename, md_en, md_zh = _resolve_md(upload_id)
        except Exception:
            pass
    # Prefer original-language Markdown for biblio extract (title/DOI more reliable)
    text = (md_en or "").strip() or (md_zh or "").strip()
    if not text.strip():
        return {
            "ok": False,
            "detail": "尚无解析 Markdown，无法识别",
            "paper": existing,
        }

    result = identify_from_text(text, filename_hint=filename)
    if not result.get("ok"):
        return {**result, "paper": existing}

    fields = {
        k: result.get(k)
        for k in (
            "title",
            "authors",
            "year",
            "doi",
            "abstract",
            "venue",
            "venue_type",
            "arxiv_id",
            "metadata_source",
        )
    }
    paper = store.apply_identified_metadata(upload_id, fields, force=force)
    _reindex_safe(upload_id)
    return {
        "ok": True,
        "matched_by": result.get("matched_by"),
        "paper": paper,
    }
