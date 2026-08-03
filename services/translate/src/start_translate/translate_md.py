#!/usr/bin/env python3
"""Translate MinerU Markdown from English to Chinese via DeepSeek V4 Flash.

Protects formulas, images, and HTML tables with placeholders so relative
structure is preserved after translation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from dotenv import load_dotenv
from openai import OpenAI

# ASCII-safe placeholders survive Windows consoles and LLM copy more reliably.
PLACEHOLDER_RE = re.compile(r"@@[A-Z]\d{3,}@@")
BLOCK_MATH_RE = re.compile(r"\$\$.*?\$\$", re.DOTALL)
TABLE_RE = re.compile(r"<table\b.*?</table>", re.DOTALL | re.IGNORECASE)
IMAGE_RE = re.compile(r"!\[.*?\]\([^)]+\)")
# MinerU academic papers: $...$ are formulas. Avoid matching $$ already protected.
INLINE_MATH_RE = re.compile(r"(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)", re.DOTALL)

# Dense inline-math paragraphs are split to reduce placeholder reordering by the model.
MAX_PLACEHOLDERS_PER_CHUNK = 5

REF_SECTION_HEADING_RE = re.compile(
    r"(?im)^(#{1,6}\s+)(REFERENCES|References|Bibliography|参考文献)\s*$"
)
ANY_HEADING_RE = re.compile(r"(?m)^#{1,6}\s+\S")
REF_ENTRY_RE = re.compile(r"^\[\d+\]\s+\S")

SYSTEM_PROMPT = """你是学术论文英译中助手。将用户给出的 Markdown 片段从英文译为中文。

硬性规则：
1. 只翻译自然语言；保留全部 Markdown / HTML 标记（标题 #、列表、链接、`<sup>` 等）。
2. 占位符形如 @@F001@@、@@I002@@、@@T003@@、@@M004@@ 必须原样保留，不得翻译、删除、改写或重排；出现顺序必须与原文完全一致。
3. 不要合并或拆分段落；输出与输入片段一一对应，不要添加解释或前后缀。
4. 学术术语首次可保留英文缩写（如 UWM、DDPM）；专有名词与作者名保持原文。
5. URL、文件路径、正文中的引用编号（如 [22]）保持不变。
6. 绝不翻译参考文献/Bibliography 条目：作者、论文题名、会议或期刊名、年份、页码、URL/DOI 等全部保持英文原文；若输入本身是参考文献条目，直接原样返回。
"""


def reference_section_ranges(text: str) -> list[tuple[int, int]]:
    """Return [start, end) ranges for REFERENCES sections (until next heading)."""
    ranges: list[tuple[int, int]] = []
    for m in REF_SECTION_HEADING_RE.finditer(text):
        start = m.start()
        next_h = ANY_HEADING_RE.search(text, m.end())
        end = next_h.start() if next_h else len(text)
        ranges.append((start, end))
    return ranges


def offset_in_ranges(offset: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= offset < end for start, end in ranges)


def localize_references_heading(chunk: str) -> str | None:
    """Map English references heading to 参考文献; return None if not a ref heading."""
    stripped = chunk.strip()
    m = REF_SECTION_HEADING_RE.match(stripped)
    if not m:
        return None
    localized = f"{m.group(1)}参考文献"
    prefix_len = chunk.find(stripped)
    suffix_start = prefix_len + len(stripped)
    return chunk[:prefix_len] + localized + chunk[suffix_start:]


@dataclass
class ProtectedDoc:
    text: str
    mapping: dict[str, str] = field(default_factory=dict)


def _make_placeholder(kind: str, index: int) -> str:
    return f"@@{kind}{index:03d}@@"


def protect_blocks(text: str) -> ProtectedDoc:
    """Replace protected structures with placeholders in priority order."""
    mapping: dict[str, str] = {}
    counters = {"F": 0, "T": 0, "I": 0, "M": 0}

    def replacer(kind: str, match: re.Match[str]) -> str:
        counters[kind] += 1
        key = _make_placeholder(kind, counters[kind])
        mapping[key] = match.group(0)
        return key

    # Order matters: block math -> tables -> images -> inline math
    text = BLOCK_MATH_RE.sub(lambda m: replacer("F", m), text)
    text = TABLE_RE.sub(lambda m: replacer("T", m), text)
    text = IMAGE_RE.sub(lambda m: replacer("I", m), text)
    text = INLINE_MATH_RE.sub(lambda m: replacer("M", m), text)
    return ProtectedDoc(text=text, mapping=mapping)


def restore_blocks(text: str, mapping: dict[str, str]) -> str:
    # Longer keys first to avoid partial issues (not expected, but safe).
    for key in sorted(mapping.keys(), key=len, reverse=True):
        text = text.replace(key, mapping[key])
    return text


def split_paragraphs(text: str) -> list[str]:
    """Split on blank lines while keeping trailing newlines structure reconstructable."""
    parts = re.split(r"(\n\s*\n)", text)
    chunks: list[str] = []
    buf = ""
    for part in parts:
        if re.fullmatch(r"\n\s*\n", part or ""):
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.append(part)
        else:
            buf += part
    if buf:
        chunks.append(buf)
    return chunks


def needs_translation(chunk: str) -> bool:
    s = chunk.strip()
    if not s:
        return False
    # Bibliography entries like "[12] Author. Title..." stay in English.
    if REF_ENTRY_RE.match(s):
        return False
    if localize_references_heading(chunk) is not None:
        # Heading is handled locally, not via the translation API.
        return False
    # Pure placeholder / punctuation / whitespace
    without = PLACEHOLDER_RE.sub("", s)
    without = re.sub(r"[\s\W_]+", "", without, flags=re.UNICODE)
    if not without:
        return False
    # Skip if no Latin letters (already Chinese / symbols only)
    if not re.search(r"[A-Za-z]", without):
        return False
    return True


def build_translation_units(text: str) -> list[tuple[str, bool]]:
    """Split text into units; False means keep as-is (or locally localized)."""
    ref_ranges = reference_section_ranges(text)
    raw_chunks = split_paragraphs(text)
    units: list[tuple[str, bool]] = []
    offset = 0
    for chunk in raw_chunks:
        start = offset
        offset += len(chunk)
        in_refs = offset_in_ranges(start, ref_ranges)

        localized = localize_references_heading(chunk)
        if localized is not None:
            units.append((localized, False))
            continue

        if in_refs:
            # Entire REFERENCES body: authors, titles, venues, URLs — keep English.
            units.append((chunk, False))
            continue

        if not needs_translation(chunk):
            units.append((chunk, False))
            continue

        for p in split_for_translation(chunk):
            units.append((p, True))
    return units


def split_sentences(chunk: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", chunk) if s]


def split_oversized(chunk: str, max_chars: int = 2500) -> list[str]:
    if len(chunk) <= max_chars:
        return [chunk]
    sentences = split_sentences(chunk)
    out: list[str] = []
    buf = ""
    for sent in sentences:
        if buf and len(buf) + len(sent) + 1 > max_chars:
            out.append(buf)
            buf = sent
        else:
            buf = f"{buf} {sent}".strip() if buf else sent
    if buf:
        out.append(buf)
    final: list[str] = []
    for piece in out:
        if len(piece) <= max_chars:
            final.append(piece)
            continue
        for i in range(0, len(piece), max_chars):
            final.append(piece[i : i + max_chars])
    return final


def split_for_translation(
    chunk: str,
    max_chars: int = 2500,
    max_placeholders: int = MAX_PLACEHOLDERS_PER_CHUNK,
) -> list[str]:
    """Split long or math-dense paragraphs to keep placeholder order stable."""
    pieces = split_oversized(chunk, max_chars=max_chars)
    out: list[str] = []
    for piece in pieces:
        ph_count = len(PLACEHOLDER_RE.findall(piece))
        if ph_count <= max_placeholders:
            out.append(piece)
            continue
        sentences = split_sentences(piece)
        if len(sentences) <= 1:
            out.append(piece)
            continue
        buf = ""
        for sent in sentences:
            candidate = f"{buf} {sent}".strip() if buf else sent
            if buf and len(PLACEHOLDER_RE.findall(candidate)) > max_placeholders:
                out.append(buf)
                buf = sent
            else:
                buf = candidate
        if buf:
            out.append(buf)
    return out


def load_glossary(path: Path | None) -> str:
    if path is None or not path.exists():
        return ""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not data:
        return ""
    lines = ["术语表（请优先遵循）："]
    for en, zh in data.items():
        lines.append(f"- {en} → {zh}")
    return "\n".join(lines)


def cache_key(text: str, model: str) -> str:
    h = hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()
    return h


def placeholders_equal(src: str, dst: str) -> bool:
    return PLACEHOLDER_RE.findall(src) == PLACEHOLDER_RE.findall(dst)


def placeholders_same_multiset(src: str, dst: str) -> bool:
    return Counter(PLACEHOLDER_RE.findall(src)) == Counter(PLACEHOLDER_RE.findall(dst))


def strip_code_fence(content: str) -> str:
    content = content.strip()
    if content.startswith("```") and content.endswith("```"):
        content = re.sub(r"^```(?:\w+)?\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
    return content.strip()


class Translator:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        cache_dir: Path,
        glossary_hint: str = "",
        temperature: float = 0.2,
        max_retries: int = 4,
        doc_stem: str | None = None,
    ) -> None:
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.glossary_hint = glossary_hint
        self.temperature = temperature
        self.max_retries = max_retries
        self.doc_stem = doc_stem

    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.txt"

    def _index_cache(self, key: str, path: Path) -> None:
        from start_translate.cache_index import append_record

        append_record("translate", key, path, self.doc_stem)

    def _system_prompt(self) -> str:
        system = SYSTEM_PROMPT
        if self.glossary_hint:
            system = f"{system}\n\n{self.glossary_hint}"
        return system

    def _chat(self, user_content: str, temperature: float | None = None) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": user_content},
            ],
            temperature=self.temperature if temperature is None else temperature,
            extra_body={"thinking": {"type": "disabled"}},
        )
        return strip_code_fence(resp.choices[0].message.content or "")

    def translate_chunk(self, text: str, context_heading: str = "") -> str:
        key = cache_key(text, self.model)
        path = self._cache_path(key)
        if path.exists():
            cached = path.read_text(encoding="utf-8")
            if placeholders_equal(text, cached):
                self._index_cache(key, path)
                return cached
            # Stale / invalid cache entry
            path.unlink(missing_ok=True)

        last_err: Exception | None = None
        src_ph = PLACEHOLDER_RE.findall(text)

        for attempt in range(self.max_retries):
            try:
                user_parts = []
                if context_heading:
                    user_parts.append(f"当前章节上下文（勿输出）：{context_heading}")
                if src_ph:
                    user_parts.append(
                        "占位符必须按此顺序原样出现，不得调换："
                        + " ".join(src_ph)
                    )
                if attempt > 0:
                    user_parts.append(
                        "上次输出占位符顺序有误，请严格按原文占位符顺序重新翻译。"
                    )
                user_parts.append("请翻译以下 Markdown 片段：")
                user_parts.append(text)
                content = self._chat("\n\n".join(user_parts))
                if not placeholders_equal(text, content):
                    if placeholders_same_multiset(text, content):
                        content = self._repair_placeholder_order(text, content)
                    else:
                        raise ValueError(
                            "Placeholder mismatch.\n"
                            f"SRC: {PLACEHOLDER_RE.findall(text)}\n"
                            f"DST: {PLACEHOLDER_RE.findall(content)}"
                        )
                if not placeholders_equal(text, content):
                    raise ValueError(
                        "Placeholder mismatch after repair.\n"
                        f"SRC: {PLACEHOLDER_RE.findall(text)}\n"
                        f"DST: {PLACEHOLDER_RE.findall(content)}"
                    )
                path.write_text(content, encoding="utf-8")
                self._index_cache(key, path)
                return content
            except Exception as err:  # noqa: BLE001
                last_err = err
                time.sleep(min(2**attempt, 12))

        # Guaranteed fallback: translate only text spans between placeholders.
        try:
            content = self._translate_by_spans(text, context_heading)
            path.write_text(content, encoding="utf-8")
            self._index_cache(key, path)
            return content
        except Exception as err:  # noqa: BLE001
            raise RuntimeError(
                f"Translation failed after retries: {last_err}; span fallback: {err}"
            ) from err

    def _repair_placeholder_order(self, src: str, bad_dst: str) -> str:
        """Ask model to fix only placeholder order, or splice mechanically if possible."""
        src_ph = PLACEHOLDER_RE.findall(src)
        dst_ph = PLACEHOLDER_RE.findall(bad_dst)
        if Counter(src_ph) == Counter(dst_ph) and len(src_ph) == len(dst_ph):
            # Mechanical realign: keep translated text segments, force SRC placeholder order.
            # This is safe when the model only swapped placeholders but kept segment count.
            dst_segments = PLACEHOLDER_RE.split(bad_dst)
            if len(dst_segments) == len(src_ph) + 1:
                parts: list[str] = []
                for i, seg in enumerate(dst_segments):
                    parts.append(seg)
                    if i < len(src_ph):
                        parts.append(src_ph[i])
                return "".join(parts)

        user = (
            "下面的中文译文里，占位符顺序错了。请只修正占位符，使它们严格按给定顺序出现；"
            "尽量不要改动中文用词。\n\n"
            f"正确占位符顺序：{' '.join(src_ph)}\n\n"
            f"待修正译文：\n{bad_dst}"
        )
        return self._chat(user, temperature=0.0)

    def _translate_by_spans(self, text: str, context_heading: str = "") -> str:
        """Translate text between placeholders; placeholders are never sent to the model."""
        segments = PLACEHOLDER_RE.split(text)
        placeholders = PLACEHOLDER_RE.findall(text)
        out: list[str] = []
        for i, seg in enumerate(segments):
            if needs_translation(seg):
                user_parts = []
                if context_heading:
                    user_parts.append(f"当前章节上下文（勿输出）：{context_heading}")
                user_parts.append(
                    "请将以下英文译为中文。不要添加解释；保留 Markdown 标记："
                )
                user_parts.append(seg)
                out.append(self._chat("\n\n".join(user_parts), temperature=0.2))
            else:
                out.append(seg)
            if i < len(placeholders):
                out.append(placeholders[i])
        result = "".join(out)
        if not placeholders_equal(text, result):
            raise ValueError("Span translation corrupted placeholders")
        return result


def extract_heading(chunk: str) -> str | None:
    for line in chunk.splitlines():
        m = re.match(r"^(#{1,6})\s+(.+)$", line.strip())
        if m:
            return m.group(2).strip()
    return None


def translate_document(
    protected: ProtectedDoc,
    translator: Translator,
    concurrency: int = 3,
    progress: Callable[[str], None] | None = None,
) -> str:
    log = progress or (lambda _msg: None)
    units = build_translation_units(protected.text)

    # Sequential context heading tracking + concurrent translate for independent units
    jobs: list[tuple[int, str, str]] = []  # index, text, heading
    current_heading = ""
    for idx, (text, do_tr) in enumerate(units):
        h = extract_heading(text)
        if h:
            current_heading = h
        if do_tr:
            jobs.append((idx, text, current_heading))

    results: dict[int, str] = {}
    failed: dict[int, str] = {}

    def work(item: tuple[int, str, str]) -> tuple[int, str, Exception | None]:
        i, text, heading = item
        try:
            return i, translator.translate_chunk(text, heading), None
        except Exception as err:  # noqa: BLE001
            return i, text, err

    log(f"Translating {len(jobs)} chunks (concurrency={concurrency})...")
    done = 0
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = [pool.submit(work, job) for job in jobs]
        for fut in as_completed(futures):
            i, out, err = fut.result()
            done += 1
            if err is not None:
                failed[i] = str(err)
                results[i] = units[i][0]  # keep English
                log(f"[{done}/{len(jobs)}] chunk {i} FAILED, kept English: {err}")
            else:
                results[i] = out
                if done % 10 == 0 or done == len(jobs):
                    log(f"[{done}/{len(jobs)}] done")

    out_parts: list[str] = []
    for idx, (text, do_tr) in enumerate(units):
        if do_tr:
            out_parts.append(results.get(idx, text))
        else:
            out_parts.append(text)

    if failed:
        log(f"Warning: {len(failed)} chunks failed and kept English.")
    return "".join(out_parts)


def normalize_blank_lines(text: str) -> str:
    """Collapse excessive blank lines from MinerU output for cleaner Markdown.

    Rules:
    - Strip trailing spaces/tabs on each line
    - Treat whitespace-only lines as empty
    - Collapse 2+ consecutive blank lines into a single blank line
    - Trim leading/trailing blank lines; end with one newline
    """
    # Normalize newlines first
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+$", "", line) for line in text.split("\n")]
    # whitespace-only -> empty
    lines = ["" if not line.strip() else line for line in lines]

    out: list[str] = []
    blank_run = 0
    for line in lines:
        if line == "":
            blank_run += 1
            # Keep at most one blank line between content blocks
            if blank_run <= 1:
                out.append("")
        else:
            blank_run = 0
            out.append(line)

    # Trim leading/trailing empties
    while out and out[0] == "":
        out.pop(0)
    while out and out[-1] == "":
        out.pop()
    return "\n".join(out) + "\n"


def validate_structure(original: str, translated: str, mapping: dict[str, str]) -> list[str]:
    warnings: list[str] = []
    for key, value in mapping.items():
        if key in translated:
            warnings.append(f"Unrestored placeholder remains: {key}")
        # After restore, original protected content should appear same times
    # Compare protected content counts in original vs translated
    for key, value in mapping.items():
        c_src = original.count(value)
        c_dst = translated.count(value)
        if c_src != c_dst:
            warnings.append(
                f"Count mismatch for protected block {key}: src={c_src} dst={c_dst}"
            )

    src_imgs = IMAGE_RE.findall(original)
    dst_imgs = IMAGE_RE.findall(translated)
    if src_imgs != dst_imgs:
        warnings.append(
            f"Image list mismatch: src={len(src_imgs)} dst={len(dst_imgs)}"
        )

    src_dollar_blocks = len(BLOCK_MATH_RE.findall(original))
    dst_dollar_blocks = len(BLOCK_MATH_RE.findall(translated))
    if src_dollar_blocks != dst_dollar_blocks:
        warnings.append(
            f"Block math count mismatch: src={src_dollar_blocks} dst={dst_dollar_blocks}"
        )

    src_headings = len(re.findall(r"(?m)^#{1,6}\s+", original))
    dst_headings = len(re.findall(r"(?m)^#{1,6}\s+", translated))
    if src_headings != dst_headings:
        warnings.append(
            f"Heading count mismatch: src={src_headings} dst={dst_headings}"
        )
    return warnings


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def default_output_path(input_path: Path) -> Path:
    from start_translate.config import outputs_dir

    out_dir = outputs_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir / f"{input_path.stem}_zh{input_path.suffix}"


def build_client_config() -> tuple[str, str, str]:
    from start_translate.config import ROOT_DIR
    load_dotenv(ROOT_DIR / ".env")
    load_dotenv()
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip()
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash").strip()
    if not api_key:
        raise SystemExit(
            "Missing DEEPSEEK_API_KEY. Copy .env.example to .env and fill your key."
        )
    return api_key, base_url, model


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="EN→ZH MinerU Markdown translator (DeepSeek)")
    p.add_argument("input", type=Path, help="Input Markdown path")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output Markdown path (default: outputs/<stem>_zh.md)",
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help="Chunk translation cache directory (default: config.yaml)",
    )
    p.add_argument(
        "--glossary",
        type=Path,
        default=None,
        help="Optional glossary JSON {english: chinese}",
    )
    p.add_argument(
        "--concurrency",
        type=int,
        default=None,
        help="Parallel chunk workers (default: config.yaml)",
    )
    p.add_argument(
        "--doc-stem",
        type=str,
        default=None,
        help="Document stem for cache index (default: input filename stem)",
    )
    p.add_argument(
        "--limit-chunks",
        type=int,
        default=0,
        help="If >0, only translate the first N translatable chunks (smoke test)",
    )
    p.add_argument(
        "--dry-run-protect",
        action="store_true",
        help="Only run protect/restore roundtrip check, no API calls",
    )
    p.add_argument(
        "--no-normalize",
        action="store_true",
        help="Keep original excessive blank lines (default: collapse them)",
    )
    p.add_argument(
        "--normalize-only",
        action="store_true",
        help="Only normalize blank lines of the input file and write to -o / *_zh.md",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path: Path = args.input
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1

    original = input_path.read_text(encoding="utf-8")

    if args.normalize_only:
        output_path = args.output or default_output_path(input_path)
        cleaned = normalize_blank_lines(original)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(cleaned, encoding="utf-8")
        print(f"Normalized blank lines -> {output_path}")
        return 0

    protected = protect_blocks(original)

    if args.dry_run_protect:
        restored = restore_blocks(protected.text, protected.mapping)
        ok = restored == original
        print(f"Protected blocks: {len(protected.mapping)}")
        print(f"Roundtrip identical: {ok}")
        if not ok:
            print(f"Original length={len(original)} restored={len(restored)}")
            return 2
        return 0

    from start_translate.config import load_config, translate_cache_dir

    cfg = load_config()
    cache_dir = args.cache_dir or translate_cache_dir()
    concurrency = (
        args.concurrency
        if args.concurrency is not None
        else int(cfg["translate"]["concurrency"])
    )

    api_key, base_url, model = build_client_config()
    glossary_hint = load_glossary(args.glossary)
    translator = Translator(
        api_key=api_key,
        base_url=base_url,
        model=model,
        cache_dir=cache_dir,
        glossary_hint=glossary_hint,
        doc_stem=args.doc_stem or input_path.stem,
    )

    # Optional smoke: temporarily mask later chunks as non-translatable by
    # translating only a prefix of the protected text's translatable units.
    if args.limit_chunks and args.limit_chunks > 0:
        units = build_translation_units(protected.text)
        seen = 0
        limited_units: list[tuple[str, bool]] = []
        for text, do_tr in units:
            if do_tr:
                seen += 1
                if seen > args.limit_chunks:
                    limited_units.append((text, False))
                    continue
            limited_units.append((text, do_tr))

        def translate_limited() -> str:
            current_heading = ""
            jobs: list[tuple[int, str, str]] = []
            for idx, (text, do_tr) in enumerate(limited_units):
                h = extract_heading(text)
                if h:
                    current_heading = h
                if do_tr:
                    jobs.append((idx, text, current_heading))
            results: dict[int, str] = {}
            print(f"Smoke test: translating {len(jobs)} chunks...")
            for i, text, heading in jobs:
                try:
                    results[i] = translator.translate_chunk(text, heading)
                    print(f"  chunk {i} ok")
                except Exception as err:  # noqa: BLE001
                    print(f"  chunk {i} FAILED: {err}")
                    results[i] = text
            parts = []
            for idx, (text, do_tr) in enumerate(limited_units):
                parts.append(results.get(idx, text) if do_tr else text)
            return "".join(parts)

        translated_protected = translate_limited()
    else:
        translated_protected = translate_document(
            protected,
            translator,
            concurrency=concurrency,
            progress=print,
        )

    translated = restore_blocks(translated_protected, protected.mapping)
    if not args.no_normalize:
        translated = normalize_blank_lines(translated)
    warnings = validate_structure(original, translated, protected.mapping)

    output_path = args.output or default_output_path(input_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(translated, encoding="utf-8")
    print(f"Wrote: {output_path}")
    print(f"Protected blocks: {len(protected.mapping)}")
    print(f"Blank-line normalize: {'off' if args.no_normalize else 'on'}")
    if warnings:
        print("Validation warnings:")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("Validation: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
