"""SQLite library store: notes, paper metadata, tags, favorites, FTS."""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_db_path: Path | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db(data_dir: Path) -> Path:
    """Create schema under START_DATA_DIR. Safe to call multiple times."""
    global _db_path
    data_dir.mkdir(parents=True, exist_ok=True)
    path = data_dir / "start.db"
    _db_path = path
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS papers (
              upload_id TEXT PRIMARY KEY,
              title TEXT,
              authors TEXT,
              year INTEGER,
              doi TEXT,
              abstract TEXT,
              favorited INTEGER NOT NULL DEFAULT 0,
              favorited_at TEXT,
              folder TEXT,
              updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS notes (
              upload_id TEXT PRIMARY KEY,
              html TEXT NOT NULL DEFAULT '',
              json TEXT,
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS annotations (
              upload_id TEXT PRIMARY KEY,
              items TEXT NOT NULL DEFAULT '[]',
              updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tags (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );

            CREATE TABLE IF NOT EXISTS paper_tags (
              upload_id TEXT NOT NULL,
              tag_id INTEGER NOT NULL,
              PRIMARY KEY (upload_id, tag_id),
              FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_papers_favorited ON papers(favorited);
            CREATE INDEX IF NOT EXISTS idx_paper_tags_tag ON paper_tags(tag_id);
            """
        )
        _migrate_papers_columns(conn)
        _ensure_annotations_table(conn)
        _ensure_fts(conn)
    return path


def _ensure_annotations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS annotations (
          upload_id TEXT PRIMARY KEY,
          items TEXT NOT NULL DEFAULT '[]',
          updated_at INTEGER NOT NULL
        )
        """
    )
    conn.commit()


def _migrate_papers_columns(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(papers)").fetchall()}
    alters = [
        ("venue", "ALTER TABLE papers ADD COLUMN venue TEXT"),
        ("venue_type", "ALTER TABLE papers ADD COLUMN venue_type TEXT"),
        ("metadata_source", "ALTER TABLE papers ADD COLUMN metadata_source TEXT"),
        ("metadata_identified_at", "ALTER TABLE papers ADD COLUMN metadata_identified_at TEXT"),
        ("arxiv_id", "ALTER TABLE papers ADD COLUMN arxiv_id TEXT"),
    ]
    for name, sql in alters:
        if name not in cols:
            conn.execute(sql)
    conn.commit()


def _ensure_fts(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='library_fts'"
    ).fetchone()
    if row:
        return
    # trigram works well for CJK substring search (SQLite >= 3.34)
    try:
        conn.execute(
            """
            CREATE VIRTUAL TABLE library_fts USING fts5(
              upload_id UNINDEXED,
              body,
              tokenize='trigram'
            )
            """
        )
    except sqlite3.OperationalError:
        conn.execute(
            """
            CREATE VIRTUAL TABLE library_fts USING fts5(
              upload_id UNINDEXED,
              body,
              tokenize='unicode61'
            )
            """
        )


def _connect() -> sqlite3.Connection:
    if _db_path is None:
        raise RuntimeError("library db not initialized; call init_db() first")
    conn = sqlite3.connect(str(_db_path), check_same_thread=False, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _strip_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


def note_has_content(html: str | None, json_str: str | None) -> bool:
    if _strip_html(html or ""):
        return True
    if not json_str:
        return False
    try:
        data = json.loads(json_str)
        content = data.get("content") if isinstance(data, dict) else None
        return bool(content)
    except Exception:
        return False


# ── Notes ──────────────────────────────────────────────────────────────


def get_note(upload_id: str) -> dict[str, Any] | None:
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT upload_id, html, json, updated_at FROM notes WHERE upload_id = ?",
            (upload_id,),
        ).fetchone()
    if not row:
        return None
    doc: dict[str, Any] = {
        "upload_id": row["upload_id"],
        "html": row["html"] or "",
        "updated_at": int(row["updated_at"]),
    }
    if row["json"]:
        try:
            doc["json"] = json.loads(row["json"])
        except Exception:
            pass
    return doc


def save_note(upload_id: str, html: str, tip_json: Any | None = None, updated_at: int | None = None) -> dict[str, Any]:
    ts = updated_at or int(datetime.now(timezone.utc).timestamp() * 1000)
    json_str = json.dumps(tip_json, ensure_ascii=False) if tip_json is not None else None
    with _lock, _connect() as conn:
        if json_str is None:
            # Preserve existing json if client only sent html
            prev = conn.execute("SELECT json FROM notes WHERE upload_id = ?", (upload_id,)).fetchone()
            json_str = prev["json"] if prev else None
        conn.execute(
            """
            INSERT INTO notes (upload_id, html, json, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(upload_id) DO UPDATE SET
              html = excluded.html,
              json = COALESCE(excluded.json, notes.json),
              updated_at = excluded.updated_at
            """,
            (upload_id, html or "", json_str, ts),
        )
        conn.commit()
    _touch_paper_row(upload_id)
    return get_note(upload_id) or {
        "upload_id": upload_id,
        "html": html or "",
        "updated_at": ts,
        **({"json": tip_json} if tip_json is not None else {}),
    }


def delete_note(upload_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM notes WHERE upload_id = ?", (upload_id,))
        conn.commit()


def get_annotations(upload_id: str) -> dict[str, Any]:
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT upload_id, items, updated_at FROM annotations WHERE upload_id = ?",
            (upload_id,),
        ).fetchone()
    if not row:
        return {"upload_id": upload_id, "items": [], "updated_at": 0}
    items: list[Any] = []
    try:
        parsed = json.loads(row["items"] or "[]")
        if isinstance(parsed, list):
            items = parsed
    except Exception:
        items = []
    return {
        "upload_id": row["upload_id"],
        "items": items,
        "updated_at": int(row["updated_at"] or 0),
    }


def save_annotations(
    upload_id: str,
    items: list[Any],
    updated_at: int | None = None,
) -> dict[str, Any]:
    ts = updated_at or int(datetime.now(timezone.utc).timestamp() * 1000)
    payload = json.dumps(items if isinstance(items, list) else [], ensure_ascii=False)
    with _lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO annotations (upload_id, items, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(upload_id) DO UPDATE SET
              items = excluded.items,
              updated_at = excluded.updated_at
            """,
            (upload_id, payload, ts),
        )
        conn.commit()
    _touch_paper_row(upload_id)
    return get_annotations(upload_id)


def delete_annotations(upload_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM annotations WHERE upload_id = ?", (upload_id,))
        conn.commit()


# ── Papers metadata / favorites / tags ────────────────────────────────


def _touch_paper_row(upload_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO papers (upload_id, updated_at)
            VALUES (?, ?)
            ON CONFLICT(upload_id) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (upload_id, _now()),
        )
        conn.commit()


def get_paper(upload_id: str) -> dict[str, Any] | None:
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM papers WHERE upload_id = ?", (upload_id,)).fetchone()
        if not row:
            return None
        tags = [
            r["name"]
            for r in conn.execute(
                """
                SELECT t.name FROM tags t
                JOIN paper_tags pt ON pt.tag_id = t.id
                WHERE pt.upload_id = ?
                ORDER BY t.name COLLATE NOCASE
                """,
                (upload_id,),
            ).fetchall()
        ]
    return _paper_dict(row, tags)


def _paper_dict(row: sqlite3.Row, tags: list[str] | None = None) -> dict[str, Any]:
    authors = row["authors"]
    authors_list: list[str] = []
    if authors:
        try:
            parsed = json.loads(authors)
            if isinstance(parsed, list):
                authors_list = [str(a) for a in parsed]
            else:
                authors_list = [str(authors)]
        except Exception:
            authors_list = [a.strip() for a in str(authors).split(";") if a.strip()]
    return {
        "upload_id": row["upload_id"],
        "title": row["title"],
        "authors": authors_list,
        "year": row["year"],
        "doi": row["doi"],
        "abstract": row["abstract"],
        "venue": row["venue"] if "venue" in row.keys() else None,
        "venue_type": row["venue_type"] if "venue_type" in row.keys() else None,
        "metadata_source": row["metadata_source"] if "metadata_source" in row.keys() else None,
        "metadata_identified_at": row["metadata_identified_at"]
        if "metadata_identified_at" in row.keys()
        else None,
        "arxiv_id": row["arxiv_id"] if "arxiv_id" in row.keys() else None,
        "favorited": bool(row["favorited"]),
        "favorited_at": row["favorited_at"],
        "folder": row["folder"],
        "tags": tags if tags is not None else [],
        "updated_at": row["updated_at"],
    }


def upsert_paper(upload_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "title",
        "authors",
        "year",
        "doi",
        "abstract",
        "folder",
        "favorited",
        "venue",
        "venue_type",
        "metadata_source",
        "metadata_identified_at",
        "arxiv_id",
    }
    with _lock, _connect() as conn:
        row = conn.execute("SELECT * FROM papers WHERE upload_id = ?", (upload_id,)).fetchone()
        cur: dict[str, Any] = dict(row) if row else {
            "upload_id": upload_id,
            "title": None,
            "authors": None,
            "year": None,
            "doi": None,
            "abstract": None,
            "venue": None,
            "venue_type": None,
            "metadata_source": None,
            "metadata_identified_at": None,
            "arxiv_id": None,
            "favorited": 0,
            "favorited_at": None,
            "folder": None,
            "updated_at": None,
        }
        for key, val in patch.items():
            if key not in allowed:
                continue
            if key == "authors":
                if val is None:
                    cur["authors"] = None
                elif isinstance(val, list):
                    cur["authors"] = json.dumps([str(a).strip() for a in val if str(a).strip()], ensure_ascii=False)
                else:
                    cur["authors"] = json.dumps([str(val).strip()], ensure_ascii=False)
            elif key == "favorited":
                fav = 1 if val else 0
                cur["favorited"] = fav
                cur["favorited_at"] = _now() if fav else None
            elif key == "year":
                cur["year"] = int(val) if val is not None and str(val).strip() != "" else None
            else:
                cur[key] = val if val is not None and val != "" else None
        cur["updated_at"] = _now()
        conn.execute(
            """
            INSERT INTO papers (
              upload_id, title, authors, year, doi, abstract,
              venue, venue_type, metadata_source, metadata_identified_at, arxiv_id,
              favorited, favorited_at, folder, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(upload_id) DO UPDATE SET
              title = excluded.title,
              authors = excluded.authors,
              year = excluded.year,
              doi = excluded.doi,
              abstract = excluded.abstract,
              venue = excluded.venue,
              venue_type = excluded.venue_type,
              metadata_source = excluded.metadata_source,
              metadata_identified_at = excluded.metadata_identified_at,
              arxiv_id = excluded.arxiv_id,
              favorited = excluded.favorited,
              favorited_at = excluded.favorited_at,
              folder = excluded.folder,
              updated_at = excluded.updated_at
            """,
            (
                upload_id,
                cur.get("title"),
                cur.get("authors"),
                cur.get("year"),
                cur.get("doi"),
                cur.get("abstract"),
                cur.get("venue"),
                cur.get("venue_type"),
                cur.get("metadata_source"),
                cur.get("metadata_identified_at"),
                cur.get("arxiv_id"),
                int(cur.get("favorited") or 0),
                cur.get("favorited_at"),
                cur.get("folder"),
                cur["updated_at"],
            ),
        )
        if "tags" in patch and patch["tags"] is not None:
            _set_tags_conn(conn, upload_id, list(patch["tags"]))
        conn.commit()
        tags = [
            r["name"]
            for r in conn.execute(
                """
                SELECT t.name FROM tags t
                JOIN paper_tags pt ON pt.tag_id = t.id
                WHERE pt.upload_id = ?
                ORDER BY t.name COLLATE NOCASE
                """,
                (upload_id,),
            ).fetchall()
        ]
        row2 = conn.execute("SELECT * FROM papers WHERE upload_id = ?", (upload_id,)).fetchone()
    return _paper_dict(row2, tags)  # type: ignore[arg-type]


def apply_identified_metadata(
    upload_id: str,
    fields: dict[str, Any],
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Merge identified fields into paper. By default only fills empty slots."""
    existing = get_paper(upload_id) or {"upload_id": upload_id}
    keys = ("title", "authors", "year", "doi", "abstract", "venue", "venue_type", "arxiv_id")
    patch: dict[str, Any] = {}
    for key in keys:
        if key not in fields or fields[key] in (None, "", []):
            continue
        cur = existing.get(key)
        empty = cur in (None, "", [])
        if force or empty:
            patch[key] = fields[key]

    src = fields.get("metadata_source")
    if patch and src:
        if force or existing.get("metadata_source") != "manual":
            patch["metadata_source"] = src
            patch["metadata_identified_at"] = _now()

    if not patch:
        return existing if "upload_id" in existing else upsert_paper(upload_id, {})
    return upsert_paper(upload_id, patch)


def _set_tags_conn(conn: sqlite3.Connection, upload_id: str, names: list[str]) -> None:
    clean = []
    seen: set[str] = set()
    for n in names:
        name = str(n).strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean.append(name)
    conn.execute("DELETE FROM paper_tags WHERE upload_id = ?", (upload_id,))
    for name in clean:
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
        tid = conn.execute("SELECT id FROM tags WHERE name = ? COLLATE NOCASE", (name,)).fetchone()
        if tid:
            conn.execute(
                "INSERT OR IGNORE INTO paper_tags (upload_id, tag_id) VALUES (?, ?)",
                (upload_id, tid["id"]),
            )


def set_paper_tags(upload_id: str, names: list[str]) -> dict[str, Any]:
    with _lock, _connect() as conn:
        conn.execute(
            """
            INSERT INTO papers (upload_id, updated_at)
            VALUES (?, ?)
            ON CONFLICT(upload_id) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (upload_id, _now()),
        )
        _set_tags_conn(conn, upload_id, names)
        conn.commit()
    paper = get_paper(upload_id)
    return paper or {"upload_id": upload_id, "tags": names}


def list_all_tags() -> list[str]:
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT name FROM tags ORDER BY name COLLATE NOCASE").fetchall()
    return [r["name"] for r in rows]


def delete_paper_data(upload_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM paper_tags WHERE upload_id = ?", (upload_id,))
        conn.execute("DELETE FROM notes WHERE upload_id = ?", (upload_id,))
        conn.execute("DELETE FROM annotations WHERE upload_id = ?", (upload_id,))
        conn.execute("DELETE FROM papers WHERE upload_id = ?", (upload_id,))
        conn.execute("DELETE FROM library_fts WHERE upload_id = ?", (upload_id,))
        conn.commit()


def library_fields_for(upload_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Batch metadata for enriching upload list responses."""
    if not upload_ids:
        return {}
    out: dict[str, dict[str, Any]] = {}
    with _lock, _connect() as conn:
        # notes flags
        q_marks = ",".join("?" * len(upload_ids))
        for row in conn.execute(
            f"SELECT upload_id, html, json FROM notes WHERE upload_id IN ({q_marks})",
            upload_ids,
        ):
            out.setdefault(row["upload_id"], {})["has_notes"] = note_has_content(row["html"], row["json"])

        for row in conn.execute(
            f"SELECT * FROM papers WHERE upload_id IN ({q_marks})",
            upload_ids,
        ):
            entry = out.setdefault(row["upload_id"], {})
            entry.update(
                {
                    "title": row["title"],
                    "authors": _paper_dict(row, [])["authors"],
                    "year": row["year"],
                    "doi": row["doi"],
                    "abstract": row["abstract"],
                    "venue": row["venue"] if "venue" in row.keys() else None,
                    "venue_type": row["venue_type"] if "venue_type" in row.keys() else None,
                    "metadata_source": row["metadata_source"]
                    if "metadata_source" in row.keys()
                    else None,
                    "arxiv_id": row["arxiv_id"] if "arxiv_id" in row.keys() else None,
                    "favorited": bool(row["favorited"]),
                    "favorited_at": row["favorited_at"],
                    "folder": row["folder"],
                }
            )

        for row in conn.execute(
            f"""
            SELECT pt.upload_id, t.name
            FROM paper_tags pt
            JOIN tags t ON t.id = pt.tag_id
            WHERE pt.upload_id IN ({q_marks})
            ORDER BY t.name COLLATE NOCASE
            """,
            upload_ids,
        ):
            entry = out.setdefault(row["upload_id"], {})
            entry.setdefault("tags", []).append(row["name"])

    for uid in upload_ids:
        entry = out.setdefault(uid, {})
        entry.setdefault("has_notes", False)
        entry.setdefault("favorited", False)
        entry.setdefault("tags", [])
        entry.setdefault("title", None)
        entry.setdefault("authors", [])
        entry.setdefault("year", None)
        entry.setdefault("doi", None)
        entry.setdefault("abstract", None)
        entry.setdefault("folder", None)
        entry.setdefault("venue", None)
        entry.setdefault("venue_type", None)
        entry.setdefault("metadata_source", None)
        entry.setdefault("arxiv_id", None)
    return out


# ── Search / FTS ───────────────────────────────────────────────────────


def reindex_paper(
    upload_id: str,
    *,
    filename: str = "",
    md_en: str = "",
    md_zh: str = "",
) -> None:
    paper = get_paper(upload_id)
    note = get_note(upload_id)
    parts = [
        filename or "",
        (paper or {}).get("title") or "",
        " ".join((paper or {}).get("authors") or []),
        str((paper or {}).get("year") or ""),
        (paper or {}).get("doi") or "",
        (paper or {}).get("abstract") or "",
        (paper or {}).get("venue") or "",
        " ".join((paper or {}).get("tags") or []),
        (paper or {}).get("folder") or "",
        _strip_html((note or {}).get("html") or ""),
        (md_en or "")[:200_000],
        (md_zh or "")[:200_000],
    ]
    body = "\n".join(p for p in parts if p)
    with _lock, _connect() as conn:
        conn.execute("DELETE FROM library_fts WHERE upload_id = ?", (upload_id,))
        if body.strip():
            conn.execute(
                "INSERT INTO library_fts (upload_id, body) VALUES (?, ?)",
                (upload_id, body),
            )
        conn.commit()


def search_upload_ids(query: str, limit: int = 100) -> list[str]:
    q = (query or "").strip()
    if not q:
        return []
    # Escape FTS special chars for MATCH; also try LIKE fallback
    fts_q = re.sub(r'[^\w\u4e00-\u9fff]+', " ", q, flags=re.UNICODE).strip()
    ids: list[str] = []
    with _lock, _connect() as conn:
        if fts_q:
            try:
                # trigram: wrap as phrase-ish by joining tokens with spaces
                rows = conn.execute(
                    """
                    SELECT upload_id FROM library_fts
                    WHERE library_fts MATCH ?
                    LIMIT ?
                    """,
                    (fts_q, limit),
                ).fetchall()
                ids = [r["upload_id"] for r in rows]
            except sqlite3.OperationalError:
                ids = []
        if not ids:
            like = f"%{q}%"
            rows = conn.execute(
                """
                SELECT upload_id FROM papers
                WHERE IFNULL(title,'') LIKE ?
                   OR IFNULL(authors,'') LIKE ?
                   OR IFNULL(doi,'') LIKE ?
                   OR IFNULL(abstract,'') LIKE ?
                   OR IFNULL(folder,'') LIKE ?
                LIMIT ?
                """,
                (like, like, like, like, like, limit),
            ).fetchall()
            ids = [r["upload_id"] for r in rows]
            if len(ids) < limit:
                note_rows = conn.execute(
                    """
                    SELECT upload_id FROM notes
                    WHERE html LIKE ?
                    LIMIT ?
                    """,
                    (like, limit - len(ids)),
                ).fetchall()
                for r in note_rows:
                    if r["upload_id"] not in ids:
                        ids.append(r["upload_id"])
    return ids


def list_indexed_upload_ids() -> list[str]:
    with _lock, _connect() as conn:
        ids = {r["upload_id"] for r in conn.execute("SELECT upload_id FROM papers")}
        ids |= {r["upload_id"] for r in conn.execute("SELECT upload_id FROM notes")}
    return sorted(ids)