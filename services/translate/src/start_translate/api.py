"""Library API for BFF / programmatic use."""

from __future__ import annotations

from pathlib import Path


def translate_markdown(
    input_md: str | Path,
    output_md: str | Path,
    *,
    doc_stem: str | None = None,
    force: bool = False,
) -> Path:
    """Translate English MinerU Markdown to Chinese Markdown.

    Returns the output path. Skips work if output exists and force is False.
    """
    from start_translate.translate_md import main as translate_main

    inp = Path(input_md)
    out = Path(output_md)
    if out.is_file() and not force:
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    stem = doc_stem or inp.stem
    rc = translate_main([str(inp), "-o", str(out), "--doc-stem", stem])
    if rc != 0:
        raise RuntimeError(f"translate_markdown failed with code {rc}")
    return out


def export_pdf(
    zh_md: str | Path,
    pdf_path: str | Path,
    *,
    doc_stem: str | None = None,
) -> Path:
    """Export Chinese Markdown to PDF (no kept HTML)."""
    import importlib

    # Use importlib so we don't bind start_translate.export_pdf to the submodule
    # (which would shadow this function on `from start_translate import export_pdf`).
    export_mod = importlib.import_module("start_translate.export_pdf")
    export_main = export_mod.main

    md = Path(zh_md)
    pdf = Path(pdf_path)
    pdf.parent.mkdir(parents=True, exist_ok=True)
    stem = doc_stem or md.stem
    rc = export_main(
        [str(md), "-o", str(pdf), "--no-html", "--doc-stem", stem]
    )
    if rc != 0:
        raise RuntimeError(f"export_pdf failed with code {rc}")
    return pdf


def beautify_and_export(
    zh_md: str | Path,
    pdf_path: str | Path,
    html_path: str | Path,
    *,
    doc_stem: str | None = None,
    limit_chunks: int = 0,
) -> tuple[Path, Path]:
    """AI-beautify HTML and export PDF from Chinese Markdown."""
    import importlib

    export_mod = importlib.import_module("start_translate.export_pdf")
    export_main = export_mod.main

    md = Path(zh_md)
    pdf = Path(pdf_path)
    html = Path(html_path)
    pdf.parent.mkdir(parents=True, exist_ok=True)
    html.parent.mkdir(parents=True, exist_ok=True)
    stem = doc_stem or md.stem
    argv = [
        str(md),
        "-o",
        str(pdf),
        "--beautify-html",
        "--html",
        str(html),
        "--doc-stem",
        stem,
    ]
    if limit_chunks > 0:
        argv.extend(["--limit-chunks", str(limit_chunks)])
    rc = export_main(argv)
    if rc != 0:
        raise RuntimeError(f"beautify_and_export failed with code {rc}")
    return html, pdf


def run_direct(
    input_md: str | Path,
    *,
    out_dir: str | Path | None = None,
    stem: str | None = None,
    force_translate: bool = False,
) -> dict[str, Path]:
    """Full direct pipeline: EN md -> ZH md -> PDF."""
    from start_translate.cli import main as cli_main
    from start_translate.config import outputs_dir

    inp = Path(input_md)
    doc_stem = stem or inp.stem
    base = Path(out_dir) if out_dir else (outputs_dir() / doc_stem)
    zh = base / f"{doc_stem}_zh.md"
    pdf = base / f"{doc_stem}_zh.pdf"
    argv = [str(inp), "--stem", doc_stem, "--out-dir", str(base), "--zh-md", str(zh), "--pdf", str(pdf)]
    if force_translate:
        argv.append("--force-translate")
    rc = cli_main(["direct", *argv])
    if rc != 0:
        raise RuntimeError(f"run_direct failed with code {rc}")
    return {"out_dir": base, "zh_md": zh, "pdf": pdf}
