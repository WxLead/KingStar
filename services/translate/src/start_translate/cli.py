#!/usr/bin/env python3
"""Unified CLI for MinerU paper translation + PDF export.

Workflows:
  1) direct   -> Chinese Markdown + PDF
  2) beautify -> Chinese Markdown + AI-beautified HTML + PDF
  3) cache    -> list / clear API caches

If outputs/<stem>/<stem>_zh.md already exists, translation is skipped automatically.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _input_stem(input_path: Path) -> str:
    """Derive output basename from the user-submitted file (e.g. MinerU.md -> MinerU)."""
    return input_path.stem


def _resolve_paths(args: argparse.Namespace, *, with_html: bool) -> dict[str, Path]:
    """Build output paths from the submitted input filename."""
    from start_translate.config import outputs_dir

    inp = args.input
    stem = args.stem or _input_stem(inp)
    out_dir = args.out_dir or (outputs_dir() / stem)
    out_dir.mkdir(parents=True, exist_ok=True)

    zh_md = args.zh_md or (out_dir / f"{stem}_zh.md")

    paths: dict[str, Path] = {
        "out_dir": out_dir,
        "zh_md": zh_md,
    }
    if with_html:
        html = getattr(args, "html", None)
        paths["html"] = html or (out_dir / f"{stem}_zh_beautify.html")
        paths["pdf"] = args.pdf or (out_dir / f"{stem}_zh_beautify.pdf")
    else:
        paths["pdf"] = args.pdf or (out_dir / f"{stem}_zh.pdf")
    return paths


def _doc_stem(args: argparse.Namespace) -> str:
    return args.stem or _input_stem(args.input)


def _should_skip_translate(args: argparse.Namespace, zh_md: Path) -> bool:
    """Skip when *_zh.md already exists, unless --force-translate."""
    if getattr(args, "force_translate", False):
        return False
    return zh_md.is_file()


def _print_plan(inp: Path, paths: dict[str, Path], *, skip_translate: bool) -> None:
    print(f"Input:  {inp.resolve()}")
    print(f"OutDir: {paths['out_dir'].resolve()}")
    print(f"  MD:   {paths['zh_md']}")
    if "html" in paths:
        print(f"  HTML: {paths['html']}")
    print(f"  PDF:  {paths['pdf']}")
    print(f"Translate: {'skipped (found existing *_zh.md)' if skip_translate else 'run'}")


def cmd_direct(args: argparse.Namespace) -> int:
    """EN Markdown -> ZH Markdown -> PDF."""
    from start_translate.export_pdf import main as export_main

    paths = _resolve_paths(args, with_html=False)
    skip = _should_skip_translate(args, paths["zh_md"])
    stem = _doc_stem(args)
    _print_plan(args.input, paths, skip_translate=skip)

    if skip:
        print("=== [1/2] Translate EN -> ZH Markdown (skipped) ===")
        print(f"Using existing: {paths['zh_md'].resolve()}")
    else:
        from start_translate.translate_md import main as translate_main

        print("=== [1/2] Translate EN -> ZH Markdown ===")
        rc = translate_main(
            [str(args.input), "-o", str(paths["zh_md"]), "--doc-stem", stem]
        )
        if rc != 0:
            return rc

    print("=== [2/2] Export PDF ===")
    return export_main(
        [
            str(paths["zh_md"]),
            "-o",
            str(paths["pdf"]),
            "--no-html",
            "--doc-stem",
            stem,
        ]
    )


def cmd_beautify(args: argparse.Namespace) -> int:
    """EN Markdown -> ZH Markdown -> beautified HTML + PDF."""
    from start_translate.export_pdf import main as export_main

    paths = _resolve_paths(args, with_html=True)
    skip = _should_skip_translate(args, paths["zh_md"])
    stem = _doc_stem(args)
    _print_plan(args.input, paths, skip_translate=skip)

    if skip:
        print("=== [1/2] Translate EN -> ZH Markdown (skipped) ===")
        print(f"Using existing: {paths['zh_md'].resolve()}")
    else:
        from start_translate.translate_md import main as translate_main

        print("=== [1/2] Translate EN -> ZH Markdown ===")
        rc = translate_main(
            [str(args.input), "-o", str(paths["zh_md"]), "--doc-stem", stem]
        )
        if rc != 0:
            return rc

    print("=== [2/2] Beautify HTML + Export PDF ===")
    export_argv = [
        str(paths["zh_md"]),
        "-o",
        str(paths["pdf"]),
        "--beautify-html",
        "--html",
        str(paths["html"]),
        "--doc-stem",
        stem,
    ]
    if args.limit_chunks and args.limit_chunks > 0:
        export_argv.extend(["--limit-chunks", str(args.limit_chunks)])
    return export_main(export_argv)


def cmd_cache_list(args: argparse.Namespace) -> int:
    from start_translate.cache_index import format_list, list_cache_files

    print(format_list(stem=args.stem))
    print(f"Cache .txt files on disk: {len(list_cache_files())}")
    return 0


def cmd_cache_clear(args: argparse.Namespace) -> int:
    from start_translate.cache_index import clear_cache, parse_duration

    if args.older_than:
        try:
            parse_duration(args.older_than)
        except ValueError as err:
            print(str(err), file=sys.stderr)
            return 2

    deleted, skipped = clear_cache(
        stem=args.stem,
        older_than=args.older_than,
        dry_run=args.dry_run,
    )
    mode = "dry-run" if args.dry_run else "deleted"
    print(f"Cache clear ({mode}): {deleted} removed, {skipped} kept (age filter)")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="MinerU paper: translate to Chinese MD and export PDF",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m start_translate.cli direct paper.md
  python -m start_translate.cli direct paper.md --force-translate
  python -m start_translate.cli beautify paper.md
  python -m start_translate.cli cache list
  python -m start_translate.cli cache clear --dry-run --older-than 30d
""",
    )
    sub = p.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("input", type=Path, help="English MinerU Markdown path")
    common.add_argument(
        "--stem",
        type=str,
        default=None,
        help="Output basename (default: same as input filename without extension)",
    )
    common.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory (default: outputs/<stem>/)",
    )
    common.add_argument(
        "--zh-md",
        type=Path,
        default=None,
        help="Chinese Markdown path (default: <out-dir>/<stem>_zh.md)",
    )
    common.add_argument(
        "--pdf",
        type=Path,
        default=None,
        help="PDF output path (default: <stem>_zh.pdf or <stem>_zh_beautify.pdf)",
    )
    common.add_argument(
        "--force-translate",
        action="store_true",
        help="Re-translate even if <stem>_zh.md already exists",
    )

    p_direct = sub.add_parser(
        "direct",
        parents=[common],
        help="Translate to ZH Markdown and export PDF (no HTML keep)",
    )
    p_direct.set_defaults(func=cmd_direct)

    p_beautify = sub.add_parser(
        "beautify",
        parents=[common],
        help="Translate, AI-beautify HTML, export both HTML and PDF",
    )
    p_beautify.add_argument(
        "--html",
        type=Path,
        default=None,
        help="Beautified HTML output path (default: <out-dir>/<stem>_zh_beautify.html)",
    )
    p_beautify.add_argument(
        "--limit-chunks",
        type=int,
        default=0,
        help="Smoke-test: only beautify first N HTML chunks",
    )
    p_beautify.set_defaults(func=cmd_beautify)

    p_cache = sub.add_parser("cache", help="List or clear local API caches")
    cache_sub = p_cache.add_subparsers(dest="cache_command", required=True)

    p_list = cache_sub.add_parser("list", help="List cache index records")
    p_list.add_argument("--stem", type=str, default=None, help="Filter by document stem")
    p_list.set_defaults(func=cmd_cache_list)

    p_clear = cache_sub.add_parser("clear", help="Clear cache files")
    p_clear.add_argument("--stem", type=str, default=None, help="Clear only this stem (indexed)")
    p_clear.add_argument(
        "--older-than",
        type=str,
        default=None,
        help="Only delete files older than duration (e.g. 30d, 24h)",
    )
    p_clear.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be deleted without deleting",
    )
    p_clear.set_defaults(func=cmd_cache_clear)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if getattr(args, "input", None) is not None and not args.input.exists():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
