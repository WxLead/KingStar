"""Bibliographic citation export: BibTeX and RIS."""

from __future__ import annotations

import re
from typing import Any, Literal

CiteFormat = Literal["bibtex", "ris"]


def _authors(paper: dict[str, Any]) -> list[str]:
    raw = paper.get("authors") or []
    if isinstance(raw, str):
        parts = re.split(r"[;；,，]", raw)
        return [p.strip() for p in parts if p.strip()]
    return [str(a).strip() for a in raw if str(a).strip()]


def _title(paper: dict[str, Any], fallback: str | None = None) -> str:
    t = (paper.get("title") or "").strip()
    if t:
        return t
    fb = (fallback or paper.get("filename") or "Untitled").strip()
    if fb.lower().endswith(".pdf"):
        fb = fb[:-4]
    return fb or "Untitled"


def _cite_key(paper: dict[str, Any], title: str) -> str:
    authors = _authors(paper)
    year = paper.get("year")
    year_s = str(year) if year is not None else "nd"
    if authors:
        first = authors[0]
        # "Last, First" or "First Last" → last token-ish
        if "," in first:
            last = first.split(",", 1)[0].strip()
        else:
            parts = first.split()
            last = parts[-1] if parts else first
        last = re.sub(r"[^A-Za-z0-9]", "", last) or "ref"
    else:
        last = "ref"
    slug = re.sub(r"[^A-Za-z0-9]+", "", title)[:24] or "paper"
    uid = str(paper.get("upload_id") or "")[:8]
    key = f"{last}{year_s}{slug[:12]}"
    if uid:
        key = f"{key}_{uid}"
    return key


def _entry_type(paper: dict[str, Any]) -> str:
    vt = (paper.get("venue_type") or "").strip().lower()
    if vt == "conference":
        return "inproceedings"
    if vt == "journal":
        return "article"
    if vt == "preprint" or paper.get("arxiv_id"):
        return "misc"
    if paper.get("venue"):
        return "article"
    return "misc"


def _bib_escape(s: str) -> str:
    return (
        s.replace("\\", "\\textbackslash{}")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("&", "\\&")
        .replace("%", "\\%")
        .replace("#", "\\#")
        .replace("_", "\\_")
    )


def to_bibtex(paper: dict[str, Any], *, filename: str | None = None) -> str:
    title = _title(paper, filename)
    key = _cite_key(paper, title)
    etype = _entry_type(paper)
    authors = _authors(paper)
    lines = [f"@{etype}{{{key},"]
    lines.append(f"  title = {{{_bib_escape(title)}}},")
    if authors:
        lines.append(f"  author = {{{_bib_escape(' and '.join(authors))}}},")
    year = paper.get("year")
    if year is not None:
        lines.append(f"  year = {{{int(year)}}},")
    venue = (paper.get("venue") or "").strip()
    if venue:
        field = "booktitle" if etype == "inproceedings" else "journal"
        if etype == "misc":
            field = "howpublished"
            lines.append(f"  {field} = {{{_bib_escape(venue)}}},")
        else:
            lines.append(f"  {field} = {{{_bib_escape(venue)}}},")
    doi = (paper.get("doi") or "").strip()
    if doi:
        lines.append(f"  doi = {{{_bib_escape(doi)}}},")
    arxiv_id = (paper.get("arxiv_id") or "").strip()
    if arxiv_id:
        lines.append(f"  eprint = {{{_bib_escape(arxiv_id)}}},")
        lines.append("  archivePrefix = {arXiv},")
        lines.append(f"  url = {{https://arxiv.org/abs/{_bib_escape(arxiv_id)}}},")
    elif doi:
        lines.append(f"  url = {{https://doi.org/{_bib_escape(doi)}}},")
    abstract = (paper.get("abstract") or "").strip()
    if abstract:
        # keep abstracts shorter in bib files
        ab = abstract if len(abstract) <= 1200 else abstract[:1197] + "..."
        lines.append(f"  abstract = {{{_bib_escape(ab)}}},")
    # drop trailing comma on last field
    if len(lines) > 1 and lines[-1].endswith(","):
        lines[-1] = lines[-1][:-1]
    lines.append("}")
    return "\n".join(lines) + "\n"


def _ris_type(paper: dict[str, Any]) -> str:
    vt = (paper.get("venue_type") or "").strip().lower()
    if vt == "conference":
        return "CONF"
    if vt == "journal":
        return "JOUR"
    if vt == "preprint" or paper.get("arxiv_id"):
        return "ELEC"
    if paper.get("venue"):
        return "JOUR"
    return "GEN"


def to_ris(paper: dict[str, Any], *, filename: str | None = None) -> str:
    title = _title(paper, filename)
    rows: list[str] = [f"TY  - {_ris_type(paper)}"]
    rows.append(f"TI  - {title}")
    for a in _authors(paper):
        rows.append(f"AU  - {a}")
    year = paper.get("year")
    if year is not None:
        rows.append(f"PY  - {int(year)}")
    venue = (paper.get("venue") or "").strip()
    if venue:
        if _ris_type(paper) == "CONF":
            rows.append(f"T2  - {venue}")
        else:
            rows.append(f"JO  - {venue}")
    doi = (paper.get("doi") or "").strip()
    if doi:
        rows.append(f"DO  - {doi}")
        rows.append(f"UR  - https://doi.org/{doi}")
    arxiv_id = (paper.get("arxiv_id") or "").strip()
    if arxiv_id:
        rows.append(f"UR  - https://arxiv.org/abs/{arxiv_id}")
    abstract = (paper.get("abstract") or "").strip()
    if abstract:
        rows.append(f"AB  - {abstract}")
    rows.append("ER  - ")
    return "\n".join(rows) + "\n"


def format_citation(
    paper: dict[str, Any],
    fmt: CiteFormat,
    *,
    filename: str | None = None,
) -> str:
    if fmt == "ris":
        return to_ris(paper, filename=filename)
    return to_bibtex(paper, filename=filename)


def format_many(
    papers: list[dict[str, Any]],
    fmt: CiteFormat,
) -> str:
    parts: list[str] = []
    for p in papers:
        parts.append(format_citation(p, fmt, filename=p.get("filename")))
    sep = "\n" if fmt == "bibtex" else "\n"
    return sep.join(parts)
