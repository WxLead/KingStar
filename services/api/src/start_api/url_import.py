"""Resolve arXiv / DOI / PDF URLs and download bytes for upload ingest."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote, urlparse

import httpx

from start_api.metadata_identify import (
    USER_AGENT,
    extract_arxiv_id,
    lookup_arxiv,
    lookup_crossref_doi,
)

MAX_BYTES = 120 * 1024 * 1024  # 120 MB
DOWNLOAD_TIMEOUT = 120.0

_ARXIV_ID_RE = re.compile(
    r"(?:arXiv\s*:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?",
    re.IGNORECASE,
)
_DOI_RE = re.compile(
    r"(?:doi\s*:\s*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,9}/[-._;()/:A-Z0-9]+)",
    re.IGNORECASE,
)


@dataclass
class ResolvedSource:
    download_url: str
    filename: str
    arxiv_id: str | None = None
    doi: str | None = None
    hint: str = ""


def _sanitize_filename(name: str, fallback: str = "document.pdf") -> str:
    name = unquote(name or "").strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "_", name)
    name = name.strip(" .") or fallback
    if not name.lower().endswith(".pdf"):
        name = f"{name}.pdf"
    return name[:180]


def _bare_arxiv_id(text: str) -> str | None:
    text = (text or "").strip()
    m = _ARXIV_ID_RE.fullmatch(text)
    if m:
        return m.group(1)
    # Also allow plain id without anchors when pasted alone
    m2 = re.fullmatch(r"(\d{4}\.\d{4,5})(?:v\d+)?", text)
    return m2.group(1) if m2 else None


def _extract_doi(text: str) -> str | None:
    text = (text or "").strip()
    m = _DOI_RE.search(text)
    if not m:
        return None
    doi = m.group(1).rstrip(").,;]}>")
    doi = doi.split("?")[0].split("#")[0]
    if not doi.lower().startswith("10."):
        return None
    return doi


def _arxiv_pdf_url(arxiv_id: str) -> str:
    return f"https://arxiv.org/pdf/{arxiv_id}.pdf"


def resolve_source(raw: str) -> ResolvedSource:
    """Map user paste (URL / arXiv id / DOI) to a PDF download URL."""
    text = (raw or "").strip()
    if not text:
        raise ValueError("请粘贴 arXiv 链接、DOI 或 PDF 直链")

    # Bare arXiv id
    bare = _bare_arxiv_id(text)
    if bare:
        return ResolvedSource(
            download_url=_arxiv_pdf_url(bare),
            filename=f"arxiv-{bare}.pdf",
            arxiv_id=bare,
            hint="arxiv",
        )

    # arXiv URL (abs / pdf / html / export / bare id in path)
    if "arxiv.org" in text.lower():
        aid = extract_arxiv_id(text)
        if not aid:
            m = re.search(
                r"arxiv\.org/(?:abs|pdf|html|src|ps)/(\d{4}\.\d{4,5})(?:v\d+)?",
                text,
                re.IGNORECASE,
            )
            if m:
                aid = m.group(1)
        if not aid:
            m = _ARXIV_ID_RE.search(text)
            if m:
                aid = m.group(1)
        if aid:
            return ResolvedSource(
                download_url=_arxiv_pdf_url(aid),
                filename=f"arxiv-{aid}.pdf",
                arxiv_id=aid,
                hint="arxiv",
            )

    # DOI → arXiv preprint DOI, or Crossref PDF link if any
    doi = _extract_doi(text)
    if doi:
        # arXiv DOI namespace
        m = re.search(r"10\.48550/arXiv\.(\d{4}\.\d{4,5})", doi, re.IGNORECASE)
        if m:
            aid = m.group(1)
            return ResolvedSource(
                download_url=_arxiv_pdf_url(aid),
                filename=f"arxiv-{aid}.pdf",
                arxiv_id=aid,
                doi=doi,
                hint="arxiv-doi",
            )
        meta = lookup_crossref_doi(doi)
        pdf_url = None
        if meta:
            # Crossref may expose PDF in link list via raw message — we only have normalized fields.
            # Try common open PDF redirectors / publisher patterns later; for now Unpaywall-less fallback:
            pass
        # Try doi.org content negotiation for PDF
        pdf_url = _try_doi_pdf(doi)
        if pdf_url:
            return ResolvedSource(
                download_url=pdf_url,
                filename=_sanitize_filename(doi.replace("/", "_"), f"doi-{doi.split('/')[-1]}.pdf"),
                doi=doi,
                hint="doi",
            )
        raise ValueError(
            "已识别 DOI，但未能找到可公开下载的 PDF。"
            "请改用 arXiv 链接，或粘贴 PDF 直链。"
        )

    # Must look like a URL
    if not re.match(r"^https?://", text, re.IGNORECASE):
        raise ValueError(
            "无法识别链接。请粘贴 https://arxiv.org/abs/...、DOI，或以 .pdf 结尾的直链。"
        )

    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    if any(x in host for x in ("drive.google.com", "docs.google.com", "onedrive.", "sharepoint.")):
        raise ValueError("暂不支持网盘链接，请下载 PDF 后本地上传，或使用 arXiv / PDF 直链。")

    path_name = parsed.path.split("/")[-1] or "document.pdf"
    return ResolvedSource(
        download_url=text,
        filename=_sanitize_filename(path_name),
        arxiv_id=extract_arxiv_id(text),
        hint="url",
    )


def _try_doi_pdf(doi: str) -> str | None:
    """Ask doi.org for application/pdf via content negotiation."""
    url = f"https://doi.org/{doi}"
    try:
        with httpx.Client(
            timeout=30.0,
            follow_redirects=True,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "application/pdf",
            },
        ) as client:
            # HEAD first when possible
            try:
                head = client.head(url)
                ctype = (head.headers.get("content-type") or "").lower()
                if "pdf" in ctype and str(head.url):
                    return str(head.url)
            except Exception:
                pass
            # Some servers reject HEAD; probe with ranged GET
            res = client.get(url, headers={"Range": "bytes=0-1023", "Accept": "application/pdf"})
            ctype = (res.headers.get("content-type") or "").lower()
            if "pdf" in ctype:
                return str(res.url)
            # If body starts with %PDF
            chunk = res.content[:8]
            if chunk.startswith(b"%PDF"):
                return str(res.url)
    except Exception:
        return None
    return None


def download_pdf(url: str, *, suggested_name: str) -> tuple[bytes, str, str]:
    """Download URL; return (bytes, filename, content_type). Raises ValueError on failure."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,application/octet-stream,*/*",
    }
    try:
        with httpx.Client(timeout=DOWNLOAD_TIMEOUT, follow_redirects=True, headers=headers) as client:
            with client.stream("GET", url) as res:
                if res.status_code >= 400:
                    raise ValueError(f"下载失败（HTTP {res.status_code}）")
                ctype = (res.headers.get("content-type") or "").split(";")[0].strip().lower()
                # Content-Disposition filename
                filename = suggested_name
                cd = res.headers.get("content-disposition") or ""
                m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', cd, re.IGNORECASE)
                if m:
                    filename = _sanitize_filename(m.group(1), suggested_name)

                chunks: list[bytes] = []
                total = 0
                for chunk in res.iter_bytes():
                    total += len(chunk)
                    if total > MAX_BYTES:
                        raise ValueError("文件超过 120MB 上限")
                    chunks.append(chunk)
                data = b"".join(chunks)
    except ValueError:
        raise
    except httpx.TimeoutException as exc:
        raise ValueError("下载超时，请稍后重试或改用本地上传") from exc
    except Exception as exc:
        raise ValueError(f"下载失败：{exc}") from exc

    if not data:
        raise ValueError("下载内容为空")
    if not (data.startswith(b"%PDF") or "pdf" in ctype or suggested_name.lower().endswith(".pdf")):
        # HTML landing pages are common failure mode
        head = data[:200].lstrip().lower()
        if head.startswith(b"<!doctype") or head.startswith(b"<html"):
            raise ValueError("链接指向的是网页而非 PDF，请使用 arXiv abs/pdf 链接或 PDF 直链")
        if not data.startswith(b"%PDF"):
            raise ValueError("下载结果不是有效的 PDF 文件")

    if not filename.lower().endswith(".pdf"):
        filename = _sanitize_filename(filename)
    return data, filename, "application/pdf"


def enrich_metadata(arxiv_id: str | None, doi: str | None) -> dict[str, Any]:
    """Best-effort bibliographic fields for library upsert."""
    if arxiv_id:
        meta = lookup_arxiv(arxiv_id)
        if meta:
            return meta
    if doi:
        meta = lookup_crossref_doi(doi)
        if meta:
            return meta
    out: dict[str, Any] = {}
    if arxiv_id:
        out["arxiv_id"] = arxiv_id
        out["venue"] = "arXiv"
        out["venue_type"] = "preprint"
        out["metadata_source"] = "arxiv"
    if doi:
        out["doi"] = doi
    return out
