"""Auto-identify paper metadata: AI extract (primary) + Crossref/arXiv enrich."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

DOI_RE = re.compile(
    r"\b(?:doi\s*[:=]\s*|https?://(?:dx\.)?doi\.org/)?(10\.\d{4,9}/[^\s\"<>\]\}]+)",
    re.IGNORECASE,
)
ARXIV_RE = re.compile(
    r"\b(?:arXiv\s*:\s*|https?://arxiv\.org/abs/)(\d{4}\.\d{4,5})(?:v\d+)?\b",
    re.IGNORECASE,
)

USER_AGENT = (
    "StarT/0.1 (mailto:"
    + os.getenv("CROSSREF_MAILTO", os.getenv("START_CONTACT_EMAIL", "start@localhost"))
    + ")"
)


def extract_doi(text: str) -> str | None:
    if not text:
        return None
    # Prefer front-matter; stop before References to avoid citing other papers' DOIs
    cut = len(text)
    for marker in (
        "\n# References",
        "\n## References",
        "\n# REFERENCE",
        "\n## REFERENCE",
        "\nReferences\n",
        "\nREFERENCES\n",
        "\nBibliography\n",
    ):
        idx = text.lower().find(marker.lower())
        if idx > 500:
            cut = min(cut, idx)
    front = text[: min(cut, 10_000)]
    for m in DOI_RE.finditer(front):
        doi = _clean_doi(m.group(1))
        if doi:
            return doi
    return None


def extract_arxiv_id(text: str) -> str | None:
    if not text:
        return None
    for chunk in (text[:12_000], text):
        m = ARXIV_RE.search(chunk)
        if m:
            return m.group(1)
    return None


def _clean_doi(raw: str) -> str | None:
    doi = (raw or "").strip().rstrip(").,;]}>")
    doi = doi.replace(" ", "")
    if not doi.lower().startswith("10."):
        return None
    # Drop URL fragments accidentally captured
    doi = doi.split("?")[0].split("#")[0]
    return doi


def lookup_crossref_doi(doi: str, timeout: float = 12.0) -> dict[str, Any] | None:
    from urllib.parse import quote

    url = f"https://api.crossref.org/works/{quote(doi, safe=':/')}"
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get(url)
            if res.status_code != 200:
                return None
            msg = res.json().get("message") or {}
            return _normalize_crossref(msg, source="crossref")
    except Exception:
        return None


def _title_token_overlap(a: str, b: str) -> float:
    ta = {t for t in re.split(r"[^a-z0-9\u4e00-\u9fff]+", a) if len(t) > 2}
    tb = {t for t in re.split(r"[^a-z0-9\u4e00-\u9fff]+", b) if len(t) > 2}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def lookup_crossref_title(title: str, timeout: float = 12.0) -> dict[str, Any] | None:
    title = (title or "").strip()
    if len(title) < 8:
        return None
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get(
                "https://api.crossref.org/works",
                params={"query.title": title, "rows": 5},
            )
            if res.status_code != 200:
                return None
            items = (res.json().get("message") or {}).get("items") or []
            if not items:
                return None
            # Prefer high score; also accept close title substring matches
            best = max(items, key=lambda it: float(it.get("score") or 0))
            bt = _crossref_title(best) or ""
            score = float(best.get("score") or 0)
            q = title.casefold()
            b = bt.casefold()
            close = bool(bt) and (q[:48] in b or b[:48] in q or _title_token_overlap(q, b) >= 0.6)
            if score < 35 and not close:
                return None
            return _normalize_crossref(best, source="crossref-title")
    except Exception:
        return None


def lookup_arxiv(arxiv_id: str, timeout: float = 12.0) -> dict[str, Any] | None:
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": USER_AGENT}) as client:
            res = client.get(
                "https://export.arxiv.org/api/query",
                params={"id_list": arxiv_id, "max_results": 1},
            )
            if res.status_code != 200:
                return None
            import xml.etree.ElementTree as ET

            root = ET.fromstring(res.text)
            ns = {"a": "http://www.w3.org/2005/Atom"}
            entry = root.find("a:entry", ns)
            if entry is None:
                return None
            title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
            title = re.sub(r"\s+", " ", title)
            summary = (entry.findtext("a:summary", default="", namespaces=ns) or "").strip()
            summary = re.sub(r"\s+", " ", summary)
            authors = [
                (a.findtext("a:name", default="", namespaces=ns) or "").strip()
                for a in entry.findall("a:author", ns)
            ]
            authors = [a for a in authors if a]
            published = entry.findtext("a:published", default="", namespaces=ns) or ""
            year = None
            if len(published) >= 4 and published[:4].isdigit():
                year = int(published[:4])
            doi = None
            for link in entry.findall("a:link", ns):
                pass
            # arXiv sometimes has doi in arxiv namespace — skip if absent
            return {
                "title": title or None,
                "authors": authors,
                "year": year,
                "doi": doi,
                "abstract": summary[:4000] if summary else None,
                "venue": "arXiv",
                "venue_type": "preprint",
                "metadata_source": "arxiv",
                "arxiv_id": arxiv_id,
            }
    except Exception:
        return None


def _crossref_title(msg: dict[str, Any]) -> str:
    t = msg.get("title")
    if isinstance(t, list) and t:
        return str(t[0]).strip()
    if isinstance(t, str):
        return t.strip()
    return ""


def _normalize_crossref(msg: dict[str, Any], source: str) -> dict[str, Any]:
    title = _crossref_title(msg)
    authors: list[str] = []
    for a in msg.get("author") or []:
        given = (a.get("given") or "").strip()
        family = (a.get("family") or "").strip()
        name = f"{given} {family}".strip() or (a.get("name") or "").strip()
        if name:
            authors.append(name)
    year = None
    for key in ("published-print", "published-online", "created", "issued"):
        parts = ((msg.get(key) or {}).get("date-parts") or [[]])[0]
        if parts and isinstance(parts[0], int):
            year = parts[0]
            break
    doi = msg.get("DOI") or msg.get("doi")
    abstract = msg.get("abstract")
    if isinstance(abstract, str):
        abstract = re.sub(r"<[^>]+>", " ", abstract)
        abstract = re.sub(r"\s+", " ", abstract).strip()[:4000]
    else:
        abstract = None

    ctype = (msg.get("type") or "").lower()
    container = msg.get("container-title")
    if isinstance(container, list):
        container = container[0] if container else None
    event = msg.get("event")
    if isinstance(event, dict):
        event_name = event.get("name")
    else:
        event_name = event if isinstance(event, str) else None

    venue = None
    venue_type = "other"
    if "proceedings" in ctype or event_name:
        venue = (event_name or container or "").strip() or None
        venue_type = "conference"
    elif "journal" in ctype or container:
        venue = (container or "").strip() or None
        venue_type = "journal"
    elif "posted-content" in ctype or "preprint" in ctype:
        venue = (container or "Preprint").strip()
        venue_type = "preprint"
    else:
        venue = (container or event_name or "").strip() or None
        venue_type = ctype or "other"

    return {
        "title": title or None,
        "authors": authors,
        "year": year,
        "doi": _clean_doi(str(doi)) if doi else None,
        "abstract": abstract,
        "venue": venue,
        "venue_type": venue_type,
        "metadata_source": source,
    }


_AI_SYSTEM = """你是学术文献元数据抽取器。根据用户给出的论文开头（解析后的 Markdown）和文件名，抽取本篇论文自身的书目信息。

硬性规则：
1. 只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释。
2. 只能使用文本中明确出现的信息；禁止编造 DOI、年份、期刊名、作者。
3. title 必须是本篇论文标题，不要用 Abstract/Introduction 等章节名，不要用参考文献里的标题。
4. doi 仅在正文明确写出时填写，否则为 null。
5. authors 按文中写法列出；不确定就返回空数组。
6. venue 是期刊/会议/预印本平台名（若可见），否则 null。
7. abstract 只取摘要正文（可截断到约 800 字），没有则为 null。

JSON schema：
{
  "title": string|null,
  "authors": string[],
  "year": number|null,
  "doi": string|null,
  "arxiv_id": string|null,
  "venue": string|null,
  "venue_type": "journal"|"conference"|"preprint"|"other"|null,
  "abstract": string|null,
  "confidence": number
}
confidence 为 0~1，表示对标题与作者是否抽对的把握。"""


# Title / authors / abstract almost always sit on the first page(s).
# Keep AI input tiny to save tokens; Crossref enrichment does not need more body.
AI_FRONT_MAX_CHARS = 3_500
AI_FRONT_MAX_LINES = 70


def _front_matter_for_ai(text: str) -> str:
    """Clip to paper front matter only (title block + authors + abstract head)."""
    raw = (text or "").strip()
    if not raw:
        return ""

    lines = raw.splitlines()[:AI_FRONT_MAX_LINES]
    clipped: list[str] = []
    seen_abstract = False
    for line in lines:
        low = line.strip().lower().lstrip("#").strip()
        # Stop once body sections start (after we've had a chance at abstract)
        if seen_abstract and low in {
            "introduction",
            "1 introduction",
            "1. introduction",
            "i. introduction",
            "related work",
            "background",
        }:
            break
        if low in {"abstract", "摘要"} or low.startswith("abstract ") or low.startswith("摘要"):
            seen_abstract = True
        clipped.append(line)
        if sum(len(x) + 1 for x in clipped) >= AI_FRONT_MAX_CHARS:
            break

    out = "\n".join(clipped).strip()
    if len(out) > AI_FRONT_MAX_CHARS:
        out = out[:AI_FRONT_MAX_CHARS].rstrip()
    return out


def identify_from_text(
    text: str,
    *,
    filename_hint: str = "",
) -> dict[str, Any]:
    """
    Primary: AI extracts biblio fields from parsed Markdown (constrained JSON).
    Then enrich / verify via Crossref or arXiv when possible.
    Last resort: regex DOI / title heuristics.

    Returns: { ok, matched_by, fields..., detail? }
    """
    front = _front_matter_for_ai(text)
    # Heuristic / DOI regex may look a bit further than the AI window
    head = (text or "")[:8_000]
    corpus = f"{filename_hint}\n{text or ''}"

    ai = extract_metadata_with_ai(front, filename_hint=filename_hint)
    if ai and (ai.get("title") or ai.get("doi") or ai.get("arxiv_id")):
        enriched = _enrich_ai_hit(ai, corpus=corpus)
        if enriched:
            return enriched

    return _identify_heuristic(head, corpus=corpus, filename_hint=filename_hint)


def extract_metadata_with_ai(
    text: str,
    *,
    filename_hint: str = "",
) -> dict[str, Any] | None:
    """Call configured OpenAI-compatible LLM; return normalized fields or None."""
    try:
        from start_api.llm_config import completion_extra_body, load_llm_config
    except Exception:
        return None

    api_key, base_url, model = load_llm_config()
    if not api_key:
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    front = (text or "").strip()
    if not front:
        return None

    user = (
        f"文件名：{filename_hint or '（未知）'}\n\n"
        f"—— 论文文首（仅首页附近，非全文）——\n{front}\n—— 结束 ——"
    )
    try:
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=45.0)
        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": _AI_SYSTEM},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
        }
        extra = completion_extra_body(base_url)
        if extra:
            create_kwargs["extra_body"] = extra
        # Prefer JSON mode when provider supports it
        try:
            create_kwargs["response_format"] = {"type": "json_object"}
            resp = client.chat.completions.create(**create_kwargs)
        except Exception:
            create_kwargs.pop("response_format", None)
            resp = client.chat.completions.create(**create_kwargs)
        raw = (resp.choices[0].message.content or "").strip()
    except Exception:
        return None

    data = _parse_ai_json(raw)
    if not data:
        return None
    return _normalize_ai_fields(data)


def _parse_ai_json(raw: str) -> dict[str, Any] | None:
    s = (raw or "").strip()
    if not s:
        return None
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```$", "", s)
    try:
        obj = json.loads(s)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", s)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return obj if isinstance(obj, dict) else None


def _normalize_ai_fields(data: dict[str, Any]) -> dict[str, Any] | None:
    title = data.get("title")
    title = str(title).strip() if title else None
    if title and title.lower() in _SECTION_SKIP:
        title = None

    authors_raw = data.get("authors") or []
    authors: list[str] = []
    if isinstance(authors_raw, str):
        authors = [a.strip() for a in re.split(r"[;；]", authors_raw) if a.strip()]
    elif isinstance(authors_raw, list):
        authors = [str(a).strip() for a in authors_raw if str(a).strip()]

    year = data.get("year")
    try:
        year = int(year) if year is not None and str(year).strip() else None
        if year is not None and (year < 1800 or year > 2100):
            year = None
    except (TypeError, ValueError):
        year = None

    doi = _clean_doi(str(data.get("doi") or "")) if data.get("doi") else None
    arxiv_id = str(data.get("arxiv_id") or "").strip() or None
    if arxiv_id:
        m = re.search(r"(\d{4}\.\d{4,5})", arxiv_id)
        arxiv_id = m.group(1) if m else None

    venue = str(data.get("venue") or "").strip() or None
    venue_type = str(data.get("venue_type") or "").strip().lower() or None
    if venue_type not in {"journal", "conference", "preprint", "other"}:
        venue_type = None

    abstract = data.get("abstract")
    abstract = str(abstract).strip()[:4000] if abstract else None

    try:
        confidence = float(data.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    if not title and not doi and not arxiv_id:
        return None
    if confidence < 0.35 and not doi and not arxiv_id:
        return None

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "doi": doi,
        "arxiv_id": arxiv_id,
        "venue": venue,
        "venue_type": venue_type or ("preprint" if arxiv_id else None),
        "abstract": abstract,
        "confidence": confidence,
        "metadata_source": "ai",
    }


def _enrich_ai_hit(ai: dict[str, Any], *, corpus: str) -> dict[str, Any] | None:
    """Prefer registry data when DOI/title match; keep AI title if registry miss."""
    doi = ai.get("doi") or extract_doi(corpus)
    if doi:
        hit = lookup_crossref_doi(doi)
        if hit:
            return {
                "ok": True,
                "matched_by": "ai+doi",
                **_merge_ai_registry(ai, hit, source="ai-crossref"),
            }

    arxiv_id = ai.get("arxiv_id") or extract_arxiv_id(corpus)
    if arxiv_id:
        hit = lookup_arxiv(arxiv_id)
        if hit:
            return {
                "ok": True,
                "matched_by": "ai+arxiv",
                **_merge_ai_registry(ai, hit, source="ai-arxiv"),
            }

    title = (ai.get("title") or "").strip()
    if title and len(title) >= 8:
        hit = lookup_crossref_title(title)
        if hit:
            return {
                "ok": True,
                "matched_by": "ai+crossref",
                **_merge_ai_registry(ai, hit, source="ai-crossref"),
            }

    # AI-only: good enough if we have a title
    if title:
        out = {k: v for k, v in ai.items() if k != "confidence"}
        return {"ok": True, "matched_by": "ai", **out}

    return None


def _merge_ai_registry(
    ai: dict[str, Any],
    reg: dict[str, Any],
    *,
    source: str,
) -> dict[str, Any]:
    """Registry fills DOI/venue/year; AI title preferred when both exist and differ a lot."""
    ai_title = (ai.get("title") or "").strip()
    reg_title = (reg.get("title") or "").strip()
    title = reg_title or ai_title
    if ai_title and reg_title and _title_token_overlap(ai_title.casefold(), reg_title.casefold()) < 0.35:
        # Likely wrong Crossref hit — keep AI
        return {
            **{k: v for k, v in ai.items() if k != "confidence"},
            "doi": ai.get("doi") or reg.get("doi"),
            "metadata_source": "ai",
        }

    authors = reg.get("authors") or ai.get("authors") or []
    return {
        "title": title or None,
        "authors": authors,
        "year": reg.get("year") or ai.get("year"),
        "doi": reg.get("doi") or ai.get("doi"),
        "arxiv_id": ai.get("arxiv_id") or reg.get("arxiv_id"),
        "abstract": reg.get("abstract") or ai.get("abstract"),
        "venue": reg.get("venue") or ai.get("venue"),
        "venue_type": reg.get("venue_type") or ai.get("venue_type"),
        "metadata_source": source,
    }


def _identify_heuristic(
    head: str,
    *,
    corpus: str,
    filename_hint: str,
) -> dict[str, Any]:
    title_guess = (
        _guess_title(head)
        or _guess_title(filename_hint.replace("_", " ").replace("-", " "))
    )

    if title_guess:
        hit = lookup_crossref_title(title_guess)
        if hit:
            doi = extract_doi(corpus)
            if doi and not hit.get("doi"):
                hit = {**hit, "doi": doi}
            return {"ok": True, "matched_by": "title", "query_title": title_guess, **hit}

    doi = extract_doi(corpus)
    if doi:
        hit = lookup_crossref_doi(doi)
        if hit:
            return {"ok": True, "matched_by": "doi", **hit}

    arxiv_id = extract_arxiv_id(corpus)
    if arxiv_id:
        hit = lookup_arxiv(arxiv_id)
        if hit:
            return {"ok": True, "matched_by": "arxiv", **hit}

    if title_guess:
        return {
            "ok": False,
            "matched_by": "title",
            "title": title_guess,
            "detail": (
                "AI 未配置或抽取失败，且未能用标题匹配 Crossref。"
                "请在「通用设置 → AI API」配置后重试。"
            ),
        }

    return {
        "ok": False,
        "matched_by": None,
        "detail": "未能识别。请配置 AI API 后重试，或手动填写文献信息。",
    }


_SECTION_SKIP = {
    "abstract",
    "introduction",
    "references",
    "acknowledgements",
    "acknowledgments",
    "contents",
    "table of contents",
    "related work",
    "conclusion",
    "appendix",
}


def _guess_title(text: str) -> str | None:
    """Pick paper title from parsed Markdown / plain text head."""
    if not text:
        return None

    # Prefer explicit markdown headings first
    heading_candidates: list[str] = []
    plain_candidates: list[str] = []
    for line in text.splitlines()[:80]:
        s = line.strip()
        if not s:
            continue
        is_heading = s.startswith("#")
        if is_heading:
            s = s.lstrip("#").strip()
        s = re.sub(r"\*+", "", s).strip()
        if len(s) < 8 or len(s) > 300:
            continue
        low = s.lower()
        if low in _SECTION_SKIP:
            continue
        # Author-ish lines: many short tokens / emails / superscripts
        if "@" in s or re.search(r"\d\s*,\s*\d", s):
            continue
        if s.count(",") >= 3 and len(s) < 120:
            continue
        # All-caps short labels
        if s.isupper() and len(s) < 20:
            continue
        if is_heading:
            heading_candidates.append(s)
        else:
            plain_candidates.append(s)

    for s in heading_candidates + plain_candidates:
        return s[:300]
    return None
