#!/usr/bin/env python3
"""Beautify paper HTML via DeepSeek prompts, then suitable for PDF export.

Pipeline idea:
  Markdown -> base HTML body (export_pdf)
           -> protect math / images / tables
           -> DeepSeek: (1) paper CSS  (2) body structure polish
           -> assemble full HTML with MathJax + local fonts
           -> Playwright PDF

Beautification is driven by prompts, not hand-written layout rules.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from start_translate.export_pdf import (
    assemble_html,
    build_font_face_css,
    default_title,
    md_to_body_html,
    stage_fonts_beside,
)
from start_translate.translate_md import build_client_config

PLACEHOLDER_RE = re.compile(r"@@H[A-Z]\d{3,}@@")
# Protect already-rendered structural blocks in HTML body.
BLOCK_PROTECT_RE = re.compile(
    r"(?is)"
    r"(<div\b[^>]*class=\"math-display\"[^>]*>.*?</div>)"
    r"|(<span\b[^>]*class=\"math-inline\"[^>]*>.*?</span>)"
    r"|(<table\b.*?</table>)"
    r"|(<img\b[^>]*>)"
)

CACHE_VERSION = "html-beautify-v4"
MAX_PLACEHOLDERS_PER_CHUNK = 8
# Unwrap <strong>/<b> that wrap long body text (AI sometimes over-bolds paragraphs).
MAX_BOLD_KEEP_CHARS = 40

CSS_SYSTEM_PROMPT = """你是中文学术论文 HTML/CSS 美化助手。根据给定正文结构样例，设计适合“论文阅读 / 导出 PDF”的 CSS。

硬性要求：
1. 只输出一个 <style>...</style> 块，不要输出解释或其他内容。
2. 正文字体必须同时包含中英文字体栈（缺中文字体时 PDF 会变成方框）：
   - 英文/拉丁：PaperTimes / Times New Roman
   - 中文：PaperSong / SimSun
   强制推荐：font-family: "PaperTimes", "PaperSong", "Times New Roman", "SimSun", serif;
   禁止只写 PaperTimes / Times New Roman 而不带 PaperSong / SimSun。
3. 面向 A4 打印阅读：版心清晰、行距舒适、标题层级分明、图表与正文区分清楚。
4. 不要花哨网页风（不要渐变炫光、大阴影、圆角卡片堆叠、emoji）。
5. 可为这些语义类写样式（若存在）：
   .paper-root, .paper-header, .paper-title, .paper-authors, .paper-affil,
   .paper-abstract, .paper-section, .paper-figure, .paper-caption,
   .paper-table-wrap, .paper-refs, .math-display, .math-inline
6. 链接在打印时宜低调（深色即可）；表格偏学术（细线/三线表风格均可）。
7. 保持 MathJax 公式可读：不要用过大的 word-break 拆公式。
8. **禁止大段正文加粗**：
   - `p`、`.paper-abstract`、`.paper-section`、`.paper-refs`、`li`、`td` 等正文容器必须 `font-weight: 400/normal`
   - 仅标题 `h1~h6`、以及极短标签（如“摘要”二字）可加粗
   - 不要给整段 `p` 设置 `font-weight: bold/600/700`
9. **禁止改页面几何 / 页边距**（导出管线已固定，再写会叠成过宽白边）：
   - 不要写 `@page`
   - 不要给 `html` / `body` / `.paper-root` 设置 padding、四边 margin，或大于 180mm 的 max-width
   - `.paper-root` 如需写，仅限字体/颜色/行距等，不要“假装页边距”
10. **图片尺寸**：不要给 `img` / `.paper-figure img` 设置固定巨大 height，或大于 148.5mm 的 max-height；
    高度上限由导出管线统一限制为 A4 半高（等比例缩放）。
"""

BODY_SYSTEM_PROMPT = """你是中文学术论文 HTML 结构润色助手。在不改变科学内容的前提下，把片段改得更适合论文阅读与 PDF 导出。

硬性约束：
1. 占位符形如 @@HA001@@、@@HB012@@ 必须原样保留，不得删改或调换顺序。
2. 不改变科学含义，不编造内容；URL、引用编号、作者名保持原样。
3. 只输出 HTML 片段本身，不要 markdown 围栏，不要解释。
4. 可用语义包裹增强结构，例如：
   - 文首：header.paper-header / h1.paper-title / .paper-authors / .paper-affil
   - 摘要：section.paper-abstract
   - 章节：section.paper-section
   - 图片+图注：figure.paper-figure + figcaption.paper-caption
   - 表格：div.paper-table-wrap
   - 参考文献：section.paper-refs
5. 不要写 <style>、<script>、<html>、<body>；不要引入外部资源。
6. 不要删除标题；h1~h6 的数量应与输入一致（可加 class）。
7. 图注/表注尽量紧跟对应图片/表格占位符。
8. **禁止大段正文加粗**：
   - 不要用 `<strong>` / `<b>` 包裹整段或大段文字
   - 正文段落保持普通字重；允许的加粗仅限：章节标题、以及短标签（如“摘要”“关键词”，通常不超过约 10 个字）
   - 不要把摘要全文、引言段落、方法描述整段加粗
"""


def cache_key(*parts: str) -> str:
    raw = CACHE_VERSION + "\n" + "\n".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def strip_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```") and text.endswith("```"):
        text = re.sub(r"^```(?:\w+)?\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    return text.strip()


def placeholders_equal(src: str, dst: str) -> bool:
    return PLACEHOLDER_RE.findall(src) == PLACEHOLDER_RE.findall(dst)


_GEOMETRY_SELECTORS = re.compile(
    r"(?is)(^|,)\s*(html|body|\.paper-root)\s*(,|$)"
)
_IMG_SELECTORS = re.compile(
    r"(?is)(^|,)\s*(img|\.paper-figure\s+img|figure\s+img)\s*(,|$)"
)
_PROP_STRIP_GEOMETRY = re.compile(
    r"(?is)\b(padding|padding-top|padding-right|padding-bottom|padding-left|"
    r"margin|margin-top|margin-right|margin-bottom|margin-left|"
    r"max-width|width|min-width)\s*:\s*[^;}+]+;?"
)
_PROP_STRIP_IMG = re.compile(
    r"(?is)\b(height|max-height|min-height|width|max-width)\s*:\s*[^;}+]+;?"
)


def _sanitize_css_rule_block(selector: str, body: str) -> str:
    """Strip geometry / image-size props that fight the export pipeline."""
    sel = selector.strip()
    if _GEOMETRY_SELECTORS.search(sel):
        body = _PROP_STRIP_GEOMETRY.sub("", body)
    if _IMG_SELECTORS.search(sel):
        body = _PROP_STRIP_IMG.sub("", body)
        # Re-assert safe image caps inside any remaining img rule.
        body = body.rstrip()
        if body and not body.endswith(";"):
            body += ";"
        from start_translate.config import load_config

        img_h = load_config()["pdf"]["image_max_height"]
        body += (
            f" max-width: 100%; max-height: {img_h}; "
            "width: auto; height: auto; object-fit: contain;"
        )
    # Collapse leftover whitespace from removed declarations.
    body = re.sub(r"\s+", " ", body).strip()
    body = re.sub(r";\s*;", ";", body)
    return body


def sanitize_ai_css(css_block: str) -> str:
    """Neutralize AI rules that break margins, image size, or bold body text."""
    m = re.search(r"(?is)<style\b[^>]*>(.*?)</style>", css_block)
    inner = m.group(1) if m else css_block

    # Drop @page entirely — export pipeline owns page margins.
    inner = re.sub(r"(?is)@page\s*\{[^{}]*\}", "", inner)

    def _rewrite_rule(match: re.Match[str]) -> str:
        selector, body = match.group(1), match.group(2)
        cleaned = _sanitize_css_rule_block(selector, body)
        if not cleaned.strip():
            return ""
        return f"{selector.strip()} {{ {cleaned} }}"

    # Simple rule rewriter (no nested {{ }} expected in AI paper CSS).
    inner = re.sub(
        r"(?is)([^{}@][^{]*)\{([^{}]*)\}",
        _rewrite_rule,
        inner,
    )

    # If .paper-section itself is bold, paragraphs inside become bold too.
    inner = re.sub(
        r"(?is)(\.paper-section\s*\{[^}]*?)font-weight\s*:\s*[^;]+;?",
        r"\1font-weight: 400;",
        inner,
    )
    inner = re.sub(
        r"(?is)(\.paper-abstract\s*\{[^}]*?)font-weight\s*:\s*[^;]+;?",
        r"\1font-weight: 400;",
        inner,
    )
    inner = re.sub(
        r"(?is)(\.paper-root\s*\{[^}]*?)font-weight\s*:\s*[^;]+;?",
        r"\1font-weight: 400;",
        inner,
    )
    # Append overrides last so they win over earlier AI rules.
    overrides = """
/* Anti-overbold overrides (body stays regular) */
.paper-root, .paper-section, .paper-abstract, .paper-refs,
.paper-root p, .paper-section p, .paper-abstract p, .paper-refs p,
.paper-root li, .paper-root td, .paper-root th {
  font-weight: 400;
}
.paper-root h1, .paper-root h2, .paper-root h3,
.paper-root h4, .paper-root h5, .paper-root h6,
.paper-title, .paper-section > h1, .paper-section > h2,
.paper-section > h3, .paper-section > h4 {
  font-weight: 700;
}
.paper-abstract > strong:first-child,
.paper-caption strong {
  font-weight: 600;
}
"""
    from start_translate.config import load_config

    pdf = load_config()["pdf"]
    margin = pdf["page_margin"]
    page_margin = (
        f"{margin['top']} {margin['right']} {margin['bottom']} {margin['left']}"
    )
    body_w = pdf["body_max_width"]
    img_h = pdf["image_max_height"]
    geometry = f"""
/* Geometry + image caps (export pipeline; AI must not widen margins) */
@page {{ size: A4; margin: {page_margin}; }}
html {{
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
}}
body {{
  display: block;
  width: 100%;
  max-width: {body_w};
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
}}
.paper-root {{
  display: block;
  width: 100%;
  max-width: {body_w};
  margin: 0 auto;
  padding: 0;
  box-sizing: border-box;
}}
img, .paper-figure img, figure img {{
  display: block;
  max-width: 100%;
  max-height: {img_h};
  width: auto;
  height: auto;
  object-fit: contain;
}}
table th, table td,
.paper-table-wrap th, .paper-table-wrap td {{
  text-align: center;
  vertical-align: middle;
}}
"""
    # Also re-assert image cap inside sanitized img rules.
    inner = inner.replace("148.5mm", str(img_h))
    return f"<style>\n{inner.strip()}\n{overrides}\n{geometry}\n</style>"


def sanitize_body_bold(html: str, max_keep: int = MAX_BOLD_KEEP_CHARS) -> str:
    """Unwrap <strong>/<b> that wrap long text; keep short labels bold."""

    def _unwrap(match: re.Match[str]) -> str:
        inner = match.group(1)
        plain = re.sub(r"<[^>]+>", "", inner)
        plain = re.sub(r"\s+", "", plain)
        if len(plain) > max_keep:
            return inner
        return match.group(0)

    html = re.sub(r"(?is)<strong>(.*?)</strong>", _unwrap, html)
    html = re.sub(r"(?is)<b>(.*?)</b>", _unwrap, html)
    return html


def protect_html_body(body: str) -> tuple[str, dict[str, str]]:
    mapping: dict[str, str] = {}
    counter = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        key = f"@@HA{counter:03d}@@"
        mapping[key] = match.group(0)
        return key

    return BLOCK_PROTECT_RE.sub(repl, body), mapping


def restore_html_body(body: str, mapping: dict[str, str]) -> str:
    for key, value in mapping.items():
        body = body.replace(key, value)
    return body


class HtmlBeautifier:
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        cache_dir: Path,
        temperature: float = 0.4,
        max_retries: int = 4,
        doc_stem: str | None = None,
    ) -> None:
        self.client = OpenAI(api_key=api_key, base_url=base_url)
        self.model = model
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.temperature = temperature
        self.max_retries = max_retries
        self.doc_stem = doc_stem

    def _cache_path(self, key: str) -> Path:
        return self.cache_dir / f"{key}.txt"

    def _index_cache(self, key: str, path: Path) -> None:
        from start_translate.cache_index import append_record

        append_record("html_beautify", key, path, self.doc_stem)

    def _chat(self, system: str, user: str) -> str:
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=self.temperature,
            extra_body={"thinking": {"type": "disabled"}},
        )
        return strip_fence(resp.choices[0].message.content or "")

    def generate_css(self, body_sample: str, title: str) -> str:
        key = cache_key("css", self.model, title, body_sample[:4000])
        path = self._cache_path(key)
        if path.exists():
            self._index_cache(key, path)
            return path.read_text(encoding="utf-8")

        user = (
            f"论文标题：{title}\n\n"
            "以下是正文 HTML 样例（含占位符），请据此设计论文阅读向 CSS：\n\n"
            f"{body_sample[:6000]}"
        )
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                css = self._chat(CSS_SYSTEM_PROMPT, user)
                # Prefer inner CSS if the model returned a full <style> block.
                m = re.search(r"(?is)<style\b[^>]*>(.*?)</style>", css)
                inner = m.group(1).strip() if m else css.strip()
                # Drop nested style tags if model double-wrapped.
                inner = re.sub(r"(?is)</?style\b[^>]*>", "", inner).strip()
                if not inner:
                    raise ValueError("Empty CSS from model")
                css = sanitize_ai_css(f"<style>\n{inner}\n</style>")
                path.write_text(css, encoding="utf-8")
                self._index_cache(key, path)
                return css
            except Exception as err:  # noqa: BLE001
                last_err = err
                time.sleep(min(2**attempt, 12))
        raise RuntimeError(f"CSS beautify failed: {last_err}") from last_err

    def beautify_body_chunk(self, chunk: str, hint: str = "") -> str:
        key = cache_key("body", self.model, hint, chunk)
        path = self._cache_path(key)
        if path.exists():
            cached = path.read_text(encoding="utf-8")
            if placeholders_equal(chunk, cached):
                self._index_cache(key, path)
                return cached
            path.unlink(missing_ok=True)

        ph = PLACEHOLDER_RE.findall(chunk)
        last_err: Exception | None = None
        for attempt in range(self.max_retries):
            try:
                parts = [
                    "请润色以下论文 HTML 片段，使其更适合正式论文阅读与 PDF 导出。",
                ]
                if hint:
                    parts.append(f"位置提示：{hint}")
                if ph:
                    parts.append("占位符必须按此顺序出现：" + " ".join(ph))
                if attempt > 0:
                    parts.append("上次占位符或标题结构有误，请严格按约束重试。")
                parts.append(chunk)
                out = self._chat(BODY_SYSTEM_PROMPT, "\n\n".join(parts))
                if not placeholders_equal(chunk, out):
                    raise ValueError(
                        "Placeholder mismatch.\n"
                        f"SRC: {PLACEHOLDER_RE.findall(chunk)}\n"
                        f"DST: {PLACEHOLDER_RE.findall(out)}"
                    )
                src_h = len(re.findall(r"(?i)<h[1-6]\b", chunk))
                dst_h = len(re.findall(r"(?i)<h[1-6]\b", out))
                if src_h != dst_h:
                    raise ValueError(f"Heading tag count mismatch: {src_h} vs {dst_h}")
                out = sanitize_body_bold(out)
                path.write_text(out, encoding="utf-8")
                self._index_cache(key, path)
                return out
            except Exception as err:  # noqa: BLE001
                last_err = err
                time.sleep(min(2**attempt, 12))
        print(f"Body beautify failed, kept original: {last_err}", file=sys.stderr)
        return sanitize_body_bold(chunk)


def _chunk_hint(html: str, fallback: str) -> str:
    hm = re.search(r"(?is)<h([1-6])\b[^>]*>(.*?)</h\1>", html)
    if not hm:
        return fallback
    return re.sub(r"<[^>]+>", "", hm.group(2)).strip() or fallback


def split_body_for_beautify(
    body: str,
    max_chars: int = 3500,
    max_placeholders: int = MAX_PLACEHOLDERS_PER_CHUNK,
) -> list[tuple[str, str]]:
    """Split HTML body into small, low-placeholder chunks for stable AI edits."""
    parts = re.split(r"(?i)(?=<h[1-6]\b)", body)
    raw: list[tuple[str, str]] = []
    for part in parts:
        if not part:
            continue
        hint = _chunk_hint(part, "preamble" if not raw else "section")
        # Further split oversized / placeholder-dense fragments by paragraphs.
        if (
            len(part) <= max_chars
            and len(PLACEHOLDER_RE.findall(part)) <= max_placeholders
        ):
            raw.append((hint, part))
            continue
        paras = re.split(r"(?i)(?=<p\b)", part)
        buf = ""
        for para in paras:
            if not para:
                continue
            candidate = buf + para
            if buf and (
                len(candidate) > max_chars
                or len(PLACEHOLDER_RE.findall(candidate)) > max_placeholders
            ):
                raw.append((hint, buf))
                buf = para
            else:
                buf = candidate
        if buf:
            raw.append((hint, buf))
    return raw


def beautify_html_document(
    title: str,
    body_html: str,
    beautifier: HtmlBeautifier,
    max_chars: int = 3500,
    limit_chunks: int = 0,
    progress=print,
) -> tuple[str, str]:
    """Return (ai_css_style_tag, beautified_body_html)."""
    protected, mapping = protect_html_body(body_html)
    css = beautifier.generate_css(protected, title=title)
    progress(f"Generated paper CSS ({len(css)} chars)")

    out_parts: list[str] = []
    chunks = split_body_for_beautify(protected, max_chars=max_chars)
    polished = 0
    skipped_dense = 0
    for i, (hint, chunk) in enumerate(chunks):
        ph_count = len(PLACEHOLDER_RE.findall(chunk))
        if limit_chunks > 0 and polished >= limit_chunks:
            out_parts.append(chunk)
            continue
        # Formula/table-dense chunks: keep structure, rely on AI CSS for look.
        if ph_count > MAX_PLACEHOLDERS_PER_CHUNK:
            skipped_dense += 1
            out_parts.append(chunk)
            continue
        progress(
            f"Beautifying HTML chunk {i + 1}/{len(chunks)}: "
            f"{hint[:40]} ({len(chunk)} chars, ph={ph_count})"
        )
        out_parts.append(beautifier.beautify_body_chunk(chunk, hint=hint))
        polished += 1

    progress(f"Body chunks polished={polished}, skipped_dense={skipped_dense}")
    body = restore_html_body("".join(out_parts), mapping)
    body = sanitize_body_bold(body)
    if 'class="paper-root"' not in body and "class='paper-root'" not in body:
        body = f'<div class="paper-root">\n{body}\n</div>'
    return sanitize_ai_css(css), body


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Beautify paper HTML via DeepSeek")
    p.add_argument("input", type=Path, help="Input Markdown path")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output HTML path (default: outputs/<stem>_paper.html)",
    )
    p.add_argument(
        "--cache-dir",
        type=Path,
        default=None,
        help="Beautify cache directory (default: config.yaml)",
    )
    p.add_argument(
        "--max-chars",
        type=int,
        default=None,
        help="Max chars per beautify chunk (default: config.yaml)",
    )
    p.add_argument(
        "--limit-chunks",
        type=int,
        default=0,
        help="If >0, only beautify first N body chunks (CSS still generated)",
    )
    p.add_argument(
        "--doc-stem",
        type=str,
        default=None,
        help="Document stem for cache index (default: input filename stem)",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_dotenv()
    if not args.input.exists():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    from start_translate.config import beautify_cache_dir, load_config, outputs_dir

    cfg = load_config()
    cache_dir = args.cache_dir or beautify_cache_dir()
    max_chars = (
        args.max_chars
        if args.max_chars is not None
        else int(cfg["beautify"]["max_chars"])
    )

    md_text = args.input.read_text(encoding="utf-8")
    title = default_title(args.input, md_text)
    body = md_to_body_html(md_text)
    api_key, base_url, model = build_client_config()
    beautifier = HtmlBeautifier(
        api_key=api_key,
        base_url=base_url,
        model=model,
        cache_dir=cache_dir,
        doc_stem=args.doc_stem or args.input.stem,
    )
    ai_css, body2 = beautify_html_document(
        title=title,
        body_html=body,
        beautifier=beautifier,
        max_chars=max_chars,
        limit_chunks=args.limit_chunks,
        progress=print,
    )
    if args.output:
        out = args.output
    else:
        out = outputs_dir() / f"{args.input.stem}_paper.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    times_font, simsun_font = stage_fonts_beside(out)
    html = assemble_html(
        title=title,
        body=body2,
        extra_css=ai_css,
        times_font=times_font,
        simsun_font=simsun_font,
    )
    out.write_text(html, encoding="utf-8")
    print(f"Wrote: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
