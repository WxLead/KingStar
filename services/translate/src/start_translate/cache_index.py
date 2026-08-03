"""Global content-hash cache index (jsonl) for stem-aware listing/cleanup."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Literal

from start_translate.config import beautify_cache_dir, cache_root, translate_cache_dir

CacheType = Literal["translate", "html_beautify"]

INDEX_NAME = "index.jsonl"
DURATION_RE = re.compile(r"^(\d+)\s*([smhdSMHD])$")


@dataclass
class IndexRecord:
    type: CacheType
    key: str
    stem: str
    path: str
    mtime: float

    def to_json(self) -> str:
        return json.dumps(
            {
                "type": self.type,
                "key": self.key,
                "stem": self.stem,
                "path": self.path,
                "mtime": self.mtime,
            },
            ensure_ascii=False,
        )

    @classmethod
    def from_dict(cls, data: dict) -> IndexRecord | None:
        try:
            return cls(
                type=data["type"],
                key=data["key"],
                stem=str(data.get("stem") or "_unknown"),
                path=str(data["path"]),
                mtime=float(data.get("mtime") or 0),
            )
        except (KeyError, TypeError, ValueError):
            return None


def index_path() -> Path:
    return cache_root() / INDEX_NAME


def parse_duration(spec: str) -> float:
    """Parse '30d' / '7d' / '24h' / '90m' / '60s' into seconds."""
    m = DURATION_RE.match(spec.strip())
    if not m:
        raise ValueError(f"Invalid duration (use e.g. 30d, 24h, 90m): {spec}")
    amount = int(m.group(1))
    unit = m.group(2).lower()
    mult = {"s": 1, "m": 60, "h": 3600, "d": 86400}[unit]
    return float(amount * mult)


def append_record(
    cache_type: CacheType,
    key: str,
    path: Path,
    stem: str | None = None,
) -> None:
    """Append one index line after a successful cache write."""
    root = cache_root()
    root.mkdir(parents=True, exist_ok=True)
    rec = IndexRecord(
        type=cache_type,
        key=key,
        stem=(stem or "_unknown").strip() or "_unknown",
        path=str(path.resolve()),
        mtime=time.time(),
    )
    with index_path().open("a", encoding="utf-8") as fh:
        fh.write(rec.to_json() + "\n")


def iter_index() -> Iterator[IndexRecord]:
    path = index_path()
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            rec = IndexRecord.from_dict(data)
            if rec is not None:
                yield rec


def load_index_deduped() -> dict[tuple[str, str], IndexRecord]:
    """Last record wins for (type, key)."""
    out: dict[tuple[str, str], IndexRecord] = {}
    for rec in iter_index():
        out[(rec.type, rec.key)] = rec
    return out


def rewrite_index(records: Iterable[IndexRecord]) -> None:
    path = index_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [r.to_json() for r in records]
    if lines:
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    elif path.exists():
        path.unlink()


def cache_txt_dirs() -> list[Path]:
    return [translate_cache_dir(), beautify_cache_dir()]


def list_cache_files() -> list[Path]:
    files: list[Path] = []
    for d in cache_txt_dirs():
        if d.is_dir():
            files.extend(sorted(d.glob("*.txt")))
    return files


def records_for_stem(stem: str) -> list[IndexRecord]:
    stem = stem.strip()
    return [r for r in load_index_deduped().values() if r.stem == stem]


def clear_cache(
    *,
    stem: str | None = None,
    older_than: str | None = None,
    dry_run: bool = False,
) -> tuple[int, int]:
    """Delete cache .txt files (and sync index). Returns (deleted, kept_skipped)."""
    cutoff: float | None = None
    if older_than:
        cutoff = time.time() - parse_duration(older_than)

    deleted = 0
    skipped = 0
    index = load_index_deduped()

    if stem:
        to_delete: list[Path] = []
        for rec in records_for_stem(stem):
            p = Path(rec.path)
            if p.exists() and cutoff is not None and p.stat().st_mtime >= cutoff:
                skipped += 1
                continue
            to_delete.append(p)
        for p in to_delete:
            if p.exists():
                if dry_run:
                    print(f"[dry-run] delete {p}")
                else:
                    p.unlink(missing_ok=True)
            else:
                if dry_run:
                    print(f"[dry-run] prune missing {p}")
            deleted += 1
        if not dry_run:
            keep = []
            for rec in index.values():
                if rec.stem != stem:
                    keep.append(rec)
                    continue
                p = Path(rec.path)
                if p.exists() and (cutoff is None or p.stat().st_mtime >= cutoff):
                    keep.append(rec)
            rewrite_index(keep)
        return deleted, skipped

    # No stem: operate on all .txt files under cache dirs
    for p in list_cache_files():
        if cutoff is not None and p.stat().st_mtime >= cutoff:
            skipped += 1
            continue
        if dry_run:
            print(f"[dry-run] delete {p}")
        else:
            p.unlink(missing_ok=True)
        deleted += 1

    if not dry_run:
        if older_than is None:
            idx = index_path()
            if idx.exists():
                idx.unlink()
        else:
            keep = [rec for rec in index.values() if Path(rec.path).exists()]
            rewrite_index(keep)

    return deleted, skipped


def format_list(stem: str | None = None) -> str:
    rows = list(load_index_deduped().values())
    if stem:
        rows = [r for r in rows if r.stem == stem]
    rows.sort(key=lambda r: (r.stem, r.type, r.key))
    if not rows:
        return "(no index records)"
    lines = [
        f"{r.type:14} stem={r.stem:20} key={r.key[:12]}... exists={Path(r.path).exists()}"
        for r in rows
    ]
    return "\n".join(lines)
