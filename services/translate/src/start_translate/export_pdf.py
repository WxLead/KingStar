#!/usr/bin/env python3
"""Export MinerU / translated Markdown to PDF (Chinese + LaTeX + images).

Renders Markdown to HTML with MathJax, then prints PDF via headless Chromium
(Playwright). Remote images (e.g. MinerU CDN) are loaded during render.
"""

from __future__ import annotations

import argparse
import html as html_lib
import re
import shutil
import sys
from pathlib import Path

import markdown

ROOT_DIR = Path(__file__).resolve().parents[2]
FONTS_DIR = ROOT_DIR / "assets" / "fonts"
TIMES_FONT = FONTS_DIR / "TIMES.TTF"
# Prefer TTF extracted from TTC: Chromium PDF often fails to embed .ttc collections.
SIMSUN_FONT_TTF = FONTS_DIR / "SIMSUN.TTF"
SIMSUN_FONT_TTC = FONTS_DIR / "SIMSUN.TTC"
SIMSUN_FONT = SIMSUN_FONT_TTF if SIMSUN_FONT_TTF.exists() else SIMSUN_FONT_TTC
# Staged beside HTML so @font-face url() fallbacks resolve even when the HTML
# lives outside the package (e.g. under START_DATA_DIR / outputs/).
STAGED_FONTS_DIRNAME = ".start_fonts"

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>__TITLE__</title>
<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
    displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
    processEscapes: true,
    tags: 'ams'
  },
  chtml: {
    // Match surrounding body text size for inline math.
    scale: 1.0,
    matchFontHeight: true,
    mtextInheritFont: true,
    displayAlign: 'center'
  },
  options: {
    skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
  },
  startup: {
    pageReady: () => MathJax.startup.defaultPageReady().then(() => {
      document.documentElement.setAttribute('data-mathjax-ready', 'true');
    })
  }
};
</script>
<!-- CHTML keeps inline math baseline/size aligned with surrounding text. -->
<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
<style>
__FONT_FACE__
  @page {
    size: A4;
    margin: __PAGE_MARGIN__;
  }
  :root {
    --text: #1a1a1a;
    --muted: #555;
    --border: #ddd;
    --font-en: "PaperTimes", "Times New Roman", Times, serif;
    --font-zh: "PaperSong", "SimSun", "Songti SC", serif;
    --font-paper: var(--font-en), var(--font-zh);
  }
  html {
    font-size: 11pt;
    width: 100%;
    margin: 0;
    padding: 0;
  }
  body {
    /* Center the column in wide browser windows / HTML preview */
    display: block;
    width: 100%;
    max-width: __BODY_MAX_WIDTH__;
    margin: 0 auto;
    padding: 0;
    box-sizing: border-box;
    color: var(--text);
    /* English first (Times), Chinese falls through to Songti. */
    font-family: var(--font-paper);
    line-height: 1.65;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  mjx-container {
    text-indent: 0;
  }
  mjx-container[jax="CHTML"][display="true"] {
    margin: 0.9em 0;
  }
  @media print {
    body { max-width: none; }
  }
  h1, h2, h3, h4, h5, h6 {
    line-height: 1.35;
    margin: 1.2em 0 0.55em;
    font-weight: 700;
    font-family: var(--font-paper);
    page-break-after: avoid;
  }
  h1 { font-size: 1.55em; text-align: center; margin-top: 0; }
  h2 { font-size: 1.28em; border-bottom: 1px solid var(--border); padding-bottom: 0.2em; }
  h3 { font-size: 1.12em; }
  p { margin: 0.65em 0; text-align: justify; }
  a { color: #0b57d0; text-decoration: none; }
  img,
  .paper-figure img,
  figure img {
    display: block;
    max-width: 100%;
    /* Cap tall figures; keep aspect ratio with width:auto */
    max-height: __IMAGE_MAX_HEIGHT__;
    width: auto;
    height: auto;
    object-fit: contain;
    margin: 0.8em auto;
    page-break-inside: avoid;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.9em 0;
    font-size: 0.92em;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #bbb;
    padding: 0.35em 0.5em;
    text-align: center;
    vertical-align: middle;
  }
  th { background: #f3f3f3; }
  /* MinerU <eq> is normalized to $...$ before render; keep class as fallback. */
  eq, .eq {
    font-family: var(--font-en);
    font-style: italic;
  }
  sup, sub { line-height: 0; }
  ul, ol { margin: 0.5em 0 0.5em 1.4em; padding: 0; }
  li { margin: 0.25em 0; }
  blockquote {
    margin: 0.8em 0;
    padding: 0.2em 0.9em;
    border-left: 3px solid #ccc;
    color: var(--muted);
  }
  pre, code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 0.92em;
  }
  pre {
    background: #f6f6f6;
    padding: 0.7em 0.9em;
    overflow-x: auto;
    white-space: pre-wrap;
  }
  mjx-container {
    page-break-inside: avoid;
  }
  .math-display {
    display: block;
    margin: 0.9em 0;
    overflow-x: auto;
    page-break-inside: avoid;
    text-align: center;
  }
  .math-display, .math-inline, mjx-container {
    word-break: normal;
    overflow-wrap: normal;
  }
  .figure-caption, img + p {
    page-break-inside: avoid;
  }
</style>
__EXTRA_CSS__
</head>
<body>
__BODY__
</body>
</html>
"""

BLOCK_MATH_RE = re.compile(r"\$\$.*?\$\$", re.DOTALL)
INLINE_MATH_RE = re.compile(r"(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)", re.DOTALL)
# MinerU wraps table/inline TeX in <eq>...</eq>; MathJax does not see that tag.
EQ_TAG_RE = re.compile(r"<eq\b[^>]*>(.*?)</eq>", re.DOTALL | re.IGNORECASE)


def _escape_math_html(tex: str) -> str:
    """Escape HTML special chars but keep LaTeX backslashes intact."""
    return tex.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def normalize_mineru_eq_tags(md_text: str) -> str:
    """Turn MinerU <eq>LaTeX</eq> into $LaTeX$ so MathJax can render it.

    Common in HTML tables: <eq>\\mathbf{0.91} \\pm \\mathbf{0.07}</eq>
    """

    def _repl(match: re.Match[str]) -> str:
        tex = html_lib.unescape(match.group(1)).strip()
        if not tex:
            return ""
        # Already delimited
        if (tex.startswith("$$") and tex.endswith("$$")) or (
            tex.startswith("$") and tex.endswith("$")
        ):
            return tex
        return f"${tex}$"

    return EQ_TAG_RE.sub(_repl, md_text)


def protect_math(md_text: str) -> tuple[str, dict[str, tuple[str, str]]]:
    """Pull math out before Markdown parsing.

    Markdown treats \\, \\| etc. as escapes and would corrupt LaTeX
    (e.g. \\| -> |, \\\\ -> \\), which breaks MathJax in PDF.
    """
    mapping: dict[str, tuple[str, str]] = {}
    counter = 0

    def _store(chunk: str, display: bool) -> str:
        nonlocal counter
        counter += 1
        key = f"@@MATH{counter:03d}@@"
        tex = _escape_math_html(chunk)
        # Store raw TeX only; restore_math decides the HTML wrapper so we
        # never nest <div> inside <p> (invalid HTML that breaks MathJax).
        mapping[key] = ("display" if display else "inline", tex)
        return key

    text = normalize_mineru_eq_tags(md_text)
    text = BLOCK_MATH_RE.sub(lambda m: _store(m.group(0), True), text)
    text = INLINE_MATH_RE.sub(lambda m: _store(m.group(0), False), text)
    return text, mapping


def restore_math(html: str, mapping: dict[str, tuple[str, str]]) -> str:
    for key, (kind, tex) in mapping.items():
        if kind == "display":
            block = f'<div class="math-display">\n{tex}\n</div>'
            # Prefer replacing the whole paragraph wrapper to avoid <p><div>.
            # Use a lambda so LaTeX backslashes are not treated as re replacements.
            html, n = re.subn(
                rf"<p>\s*{re.escape(key)}\s*</p>",
                lambda _m, b=block: b,
                html,
                count=1,
            )
            if n == 0:
                html = html.replace(key, block)
        else:
            inline = f'<span class="math-inline">{tex}</span>'
            html = html.replace(key, inline)
    return html


def stage_fonts_beside(html_path: Path) -> tuple[Path, Path]:
    """Copy project fonts next to the HTML file.

    Chromium blocks cross-directory file:// font URLs (e.g. HTML under /data
    loading fonts from /app). Same-folder (or subfolder) file:// works, matching
    the Translation export approach without data: URI embedding.
    """
    dest_dir = html_path.parent / STAGED_FONTS_DIRNAME
    dest_dir.mkdir(parents=True, exist_ok=True)
    times_dst = dest_dir / TIMES_FONT.name
    simsun_dst = dest_dir / SIMSUN_FONT.name
    for src, dst in ((TIMES_FONT, times_dst), (SIMSUN_FONT, simsun_dst)):
        if not src.exists():
            continue
        if not dst.exists() or dst.stat().st_size != src.stat().st_size:
            shutil.copy2(src, dst)
    return times_dst, simsun_dst


def build_font_face_css(
    times_font: Path | None = None,
    simsun_font: Path | None = None,
    *,
    times_url: str | None = None,
    simsun_url: str | None = None,
) -> str:
    """Load project fonts: Times for English, SimSun (宋体) for Chinese.

    Match Translation's Windows-local behavior: PaperSong prefers
    local("SimSun") / local("宋体") first so Chromium embeds the real system
    Songti. Forcing the project SIMSUN.TTF url first often embeds in a way
    Chrome/mobile can substitute around, but Edge shows black tofu boxes.

    Project TTF urls remain as fallback when system SimSun is absent.
    Never use large data: URIs — they often fail to embed and tofu in Edge.
    """
    times = times_font or TIMES_FONT
    simsun = simsun_font or SIMSUN_FONT
    missing = [p.name for p in (times, simsun) if not p.exists()]
    if missing and not (times_url and simsun_url):
        print(
            f"Warning: missing font file(s): {', '.join(missing)}; "
            "falling back to system Times New Roman / SimSun.",
            file=sys.stderr,
        )
        return """
  /* System font fallback when assets/fonts is incomplete */
"""

    times_uri = times_url or times.resolve().as_uri()
    simsun_uri = simsun_url or simsun.resolve().as_uri()
    simsun_fmt = "truetype" if (simsun_url or simsun.suffix.lower() == ".ttf") else "collection"
    return f"""
  @font-face {{
    font-family: "PaperTimes";
    src: url("{times_uri}") format("truetype");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }}
  @font-face {{
    font-family: "PaperTimes";
    src: url("{times_uri}") format("truetype");
    font-style: italic;
    font-weight: 400;
    font-display: block;
  }}
  @font-face {{
    font-family: "PaperSong";
    src: local("SimSun"), local("宋体"),
         url("{simsun_uri}") format("{simsun_fmt}");
    font-style: normal;
    font-weight: 400;
    font-display: block;
  }}
  /* Hard fallback for PDF print: AI CSS may drop CJK fonts and cause tofu boxes.
     Match both bare Markdown HTML and beautified .paper-root trees.
     Do not target mjx-* so MathJax keeps its own math fonts. */
  body, p, li, td, th, h1, h2, h3, h4, h5, h6, figcaption,
  .paper-root, .paper-root p, .paper-root li, .paper-root td, .paper-root th,
  .paper-root h1, .paper-root h2, .paper-root h3, .paper-root h4,
  .paper-root h5, .paper-root h6, .paper-root figcaption,
  .paper-abstract, .paper-caption, .paper-authors, .paper-affil,
  .paper-header, .paper-section, .paper-title {{
    font-family: "PaperTimes", "PaperSong", "Times New Roman", "SimSun", "宋体", serif !important;
  }}
  code, pre, .paper-root code, .paper-root pre {{
    font-family: Consolas, "Courier New", monospace !important;
  }}
  /* Body text must stay regular; AI CSS sometimes bolds whole .paper-section. */
  body, p, li, td, th,
  .paper-root, .paper-section, .paper-abstract, .paper-refs,
  .paper-root p, .paper-section p, .paper-abstract p,
  .paper-root li, .paper-root td, .paper-root th {{
    font-weight: 400 !important;
  }}
  h1, h2, h3, h4, h5, h6,
  .paper-root h1, .paper-root h2, .paper-root h3,
  .paper-root h4, .paper-root h5, .paper-root h6,
  .paper-title, .paper-section > h1, .paper-section > h2,
  .paper-section > h3, .paper-section > h4 {{
    font-weight: 700 !important;
  }}
"""


def md_to_body_html(md_text: str) -> str:
    """Convert Markdown to HTML body fragment (math protected/restored)."""
    protected, math_map = protect_math(md_text)
    body = markdown.markdown(
        protected,
        extensions=[
            "extra",
            "sane_lists",
            "toc",
        ],
        output_format="html5",
    )
    return restore_math(body, math_map)


def _pdf_layout() -> dict[str, str | dict[str, str]]:
    from start_translate.config import load_config

    pdf = load_config()["pdf"]
    margin = pdf["page_margin"]
    return {
        "page_margin": (
            f"{margin['top']} {margin['right']} {margin['bottom']} {margin['left']}"
        ),
        "body_max_width": str(pdf["body_max_width"]),
        "image_max_height": str(pdf["image_max_height"]),
        "margin_dict": {
            "top": str(margin["top"]),
            "right": str(margin["right"]),
            "bottom": str(margin["bottom"]),
            "left": str(margin["left"]),
        },
    }


def build_page_lock_css() -> str:
    """Appended after AI CSS so page geometry + image caps match direct export."""
    lay = _pdf_layout()
    return f"""
<style>
/* Locked page geometry + image caps (override AI CSS; match direct export) */
@page {{
  size: A4;
  margin: {lay['page_margin']} !important;
}}
/* html stays full viewport width; only body/paper-root are centered columns */
html {{
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}}
body {{
  display: block !important;
  width: 100% !important;
  max-width: {lay['body_max_width']} !important;
  margin: 0 auto !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}}
.paper-root {{
  display: block !important;
  width: 100% !important;
  max-width: {lay['body_max_width']} !important;
  margin: 0 auto !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}}
img,
.paper-figure img,
figure img {{
  display: block !important;
  max-width: 100% !important;
  max-height: {lay['image_max_height']} !important;
  width: auto !important;
  height: auto !important;
  object-fit: contain !important;
  margin-left: auto !important;
  margin-right: auto !important;
}}
table th,
table td,
.paper-table-wrap th,
.paper-table-wrap td {{
  text-align: center !important;
  vertical-align: middle !important;
}}
</style>
"""


def assemble_html(
    title: str,
    body: str,
    extra_css: str = "",
    *,
    times_font: Path | None = None,
    simsun_font: Path | None = None,
) -> str:
    """Assemble full HTML document with fonts, MathJax, and optional AI CSS.

    Page-lock CSS is always appended last so AI styles cannot widen page margins
    or remove the configured image height cap.
    """
    lay = _pdf_layout()
    page_lock = build_page_lock_css()
    parts = [p for p in ((extra_css or "").rstrip(), page_lock.strip()) if p]
    combined_extra = "\n".join(parts)
    return (
        HTML_TEMPLATE.replace("__TITLE__", _html_escape(title))
        .replace(
            "__FONT_FACE__",
            build_font_face_css(times_font=times_font, simsun_font=simsun_font),
        )
        .replace("__PAGE_MARGIN__", str(lay["page_margin"]))
        .replace("__BODY_MAX_WIDTH__", str(lay["body_max_width"]))
        .replace("__IMAGE_MAX_HEIGHT__", str(lay["image_max_height"]))
        .replace("__EXTRA_CSS__", combined_extra)
        .replace("__BODY__", body)
    )


def md_to_html(
    md_text: str,
    title: str,
    extra_css: str = "",
    *,
    times_font: Path | None = None,
    simsun_font: Path | None = None,
) -> str:
    return assemble_html(
        title=title,
        body=md_to_body_html(md_text),
        extra_css=extra_css,
        times_font=times_font,
        simsun_font=simsun_font,
    )


def _html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def default_title(md_path: Path, md_text: str) -> str:
    for line in md_text.splitlines():
        m = re.match(r"^#\s+(.+)$", line.strip())
        if m:
            return re.sub(r"<[^>]+>", "", m.group(1)).strip()
    return md_path.stem


def export_pdf_with_playwright(html_path: Path, pdf_path: Path, base_url: str) -> None:
    """Print the local HTML exactly as the browser shows it (screen media).

    Same approach as Translation: open the file:// HTML, prefer system SimSun via
    local() for Chinese embedding (Edge-safe on Windows), and wait for fonts
    before page.pdf(). Staged project TTFs remain as @font-face fallbacks.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as err:
        raise SystemExit(
            "Missing dependency: playwright\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        ) from err

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    times_font, simsun_font = stage_fonts_beside(html_path)
    print_font_css = build_font_face_css(
        times_font=times_font if times_font.exists() else None,
        simsun_font=simsun_font if simsun_font.exists() else None,
    )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Approx. CSS A4 content width at 96dpi so on-screen layout ≈ print layout.
        context = browser.new_context(
            viewport={"width": 794, "height": 1123},
            device_scale_factor=2,
        )
        page = context.new_page()
        # Critical: use screen styles (what you see in the browser), not print CSS.
        page.emulate_media(media="screen")
        page.goto(base_url, wait_until="networkidle", timeout=180_000)
        if print_font_css.strip():
            page.add_style_tag(content=print_font_css)
        try:
            page.wait_for_function(
                "() => document.documentElement.getAttribute('data-mathjax-ready') === 'true'",
                timeout=120_000,
            )
        except Exception:
            page.wait_for_timeout(5000)
        try:
            page.wait_for_function(
                """() => document.fonts && document.fonts.status === 'loaded'
                    && document.querySelectorAll('mjx-container').length > 0""",
                timeout=60_000,
            )
        except Exception:
            pass
        try:
            page.evaluate(
                """async () => {
                  if (!document.fonts) return;
                  await document.fonts.ready;
                  await Promise.all([
                    document.fonts.load('16px PaperSong'),
                    document.fonts.load('16px PaperTimes'),
                    document.fonts.load('700 16px PaperSong'),
                    document.fonts.load('700 16px PaperTimes'),
                  ]);
                  const probe = document.createElement('div');
                  probe.setAttribute('aria-hidden', 'true');
                  probe.style.cssText =
                    'position:absolute;left:-99999px;top:0;font-family:PaperSong,PaperTimes,serif;font-size:16px;';
                  probe.textContent = '汉字嵌入测试中文排版';
                  document.body.appendChild(probe);
                  void probe.offsetWidth;
                  await document.fonts.ready;
                }"""
            )
        except Exception:
            pass
        try:
            page.wait_for_function(
                """() => {
                  const imgs = Array.from(document.images);
                  if (imgs.length === 0) return true;
                  return imgs.every((img) => img.complete);
                }""",
                timeout=120_000,
            )
        except Exception:
            pass
        page.wait_for_timeout(500)
        page.pdf(
            path=str(pdf_path),
            format="A4",
            print_background=True,
            prefer_css_page_size=True,
            scale=1.0,
            margin=_pdf_layout()["margin_dict"],
        )
        browser.close()


def export_pdf_with_chrome(html_path: Path, pdf_path: Path) -> None:
    """Fallback: system Chrome/Edge headless print-to-pdf (weaker MathJax wait)."""
    import shutil
    import subprocess
    import time

    chrome = (
        shutil.which("chrome")
        or shutil.which("chrome.exe")
        or r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    )
    edge = (
        shutil.which("msedge")
        or shutil.which("msedge.exe")
        or r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
    )
    browser = Path(chrome)
    if not browser.exists():
        browser = Path(edge)
    if not browser.exists():
        raise SystemExit("Neither Chrome nor Edge found for PDF fallback.")

    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    url = html_path.resolve().as_uri()
    cmd = [
        str(browser),
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path.resolve()}",
        "--print-to-pdf-no-header",
        url,
    ]
    subprocess.run(cmd, check=False, capture_output=True)
    if not pdf_path.exists() or pdf_path.stat().st_size < 1000:
        time.sleep(2)
        subprocess.run(cmd, check=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Export Markdown to PDF (Chinese + math)")
    p.add_argument("input", type=Path, help="Input .md path")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output .pdf path (default: outputs/<stem>.pdf)",
    )
    p.add_argument(
        "--engine",
        choices=("playwright", "chrome"),
        default="playwright",
        help="PDF engine (default: playwright)",
    )
    p.add_argument(
        "--html",
        type=Path,
        default=None,
        help="Intermediate HTML path (default: same name as PDF, .html)",
    )
    p.add_argument(
        "--keep-html",
        type=Path,
        default=None,
        help="Deprecated alias of --html",
    )
    p.add_argument(
        "--no-html",
        action="store_true",
        help="Do not keep local HTML (use a temp file only)",
    )
    p.add_argument(
        "--beautify-html",
        action="store_true",
        help="DeepSeek-beautify HTML (paper CSS + body structure) before PDF export",
    )
    p.add_argument(
        "--beautify-html-output",
        type=Path,
        default=None,
        help="Where to save beautified HTML (default: same as --html / <pdf>.html)",
    )
    p.add_argument(
        "--limit-chunks",
        type=int,
        default=0,
        help="With --beautify-html: only polish first N body chunks (smoke test)",
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
    input_path: Path = args.input
    if not input_path.exists():
        print(f"Input not found: {input_path}", file=sys.stderr)
        return 1

    if args.output:
        pdf_path = args.output
    else:
        from start_translate.config import outputs_dir

        out_dir = outputs_dir()
        out_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = out_dir / f"{input_path.stem}.pdf"
    is_html_input = input_path.suffix.lower() in {".html", ".htm"}

    cleanup_html = False
    if args.no_html:
        # Keep temp HTML next to the PDF (project outputs/), not system Temp.
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        html_path = pdf_path.with_name(f".{pdf_path.stem}.tmp.html")
        cleanup_html = True
    else:
        html_path = (
            args.beautify_html_output
            or args.html
            or args.keep_html
            or pdf_path.with_suffix(".html")
        )
        html_path.parent.mkdir(parents=True, exist_ok=True)
    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    times_font, simsun_font = stage_fonts_beside(html_path)

    if is_html_input:
        # Directly print an existing HTML file (e.g. AI-beautified *_paper.html).
        html = input_path.read_text(encoding="utf-8")
        if html_path.resolve() != input_path.resolve():
            html_path.write_text(html, encoding="utf-8")
        else:
            html_path = input_path
    else:
        md_text = input_path.read_text(encoding="utf-8")
        title = default_title(input_path, md_text)
        if args.beautify_html:
            from start_translate.beautify_html import HtmlBeautifier, beautify_html_document
            from start_translate.config import beautify_cache_dir
            from start_translate.translate_md import build_client_config

            api_key, base_url, model = build_client_config()
            beautifier = HtmlBeautifier(
                api_key=api_key,
                base_url=base_url,
                model=model,
                cache_dir=beautify_cache_dir(),
                doc_stem=args.doc_stem or input_path.stem,
            )
            body = md_to_body_html(md_text)
            ai_css, body2 = beautify_html_document(
                title=title,
                body_html=body,
                beautifier=beautifier,
                limit_chunks=args.limit_chunks,
                progress=print,
            )
            html = assemble_html(
                title=title,
                body=body2,
                extra_css=ai_css,
                times_font=times_font,
                simsun_font=simsun_font,
            )
            print("Using AI-beautified HTML")
        else:
            html = md_to_html(
                md_text,
                title=title,
                times_font=times_font,
                simsun_font=simsun_font,
            )
        html_path.write_text(html, encoding="utf-8")

    try:
        base_url = html_path.resolve().as_uri()
        print(f"Rendering: {html_path}")
        if args.engine == "playwright":
            try:
                export_pdf_with_playwright(html_path, pdf_path, base_url)
            except SystemExit:
                print(
                    "Playwright unavailable, falling back to Chrome/Edge...",
                    file=sys.stderr,
                )
                export_pdf_with_chrome(html_path, pdf_path)
        else:
            export_pdf_with_chrome(html_path, pdf_path)
        print(f"Wrote: {pdf_path.resolve()}")
        if not args.no_html:
            print(f"HTML:  {html_path.resolve()}")
        return 0
    finally:
        if cleanup_html and html_path.exists():
            try:
                html_path.unlink()
            except OSError as exc:
                print(f"Warning: failed to remove temp HTML {html_path}: {exc}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
