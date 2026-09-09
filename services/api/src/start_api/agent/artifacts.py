"""Durable agent artifacts (reports / web cards) for the research assistant pane."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from start_api import db as library_db

_KINDS = frozenset({"report", "web", "file"})
_STATUSES = frozenset({"drafting", "ready", "error", "archived"})


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_artifact_table() -> None:
    with library_db._connect() as conn:  # noqa: SLF001
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_artifacts (
              artifact_id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              turn_id TEXT,
              kind TEXT NOT NULL,
              title TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'drafting',
              uri TEXT,
              rel_path TEXT,
              content TEXT NOT NULL DEFAULT '',
              meta_json TEXT NOT NULL DEFAULT '{}',
              version INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agent_artifacts_session
              ON agent_artifacts(session_id, updated_at);
            """
        )
        conn.commit()


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    raw = item.pop("meta_json", "{}") or "{}"
    try:
        item["meta"] = json.loads(raw)
    except json.JSONDecodeError:
        item["meta"] = {}
    return item


def get_artifact(artifact_id: str) -> dict[str, Any] | None:
    ensure_artifact_table()
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM agent_artifacts WHERE artifact_id = ?",
            (artifact_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def list_artifacts(session_id: str, *, limit: int = 100) -> list[dict[str, Any]]:
    ensure_artifact_table()
    lim = max(1, min(int(limit or 100), 200))
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM agent_artifacts
            WHERE session_id = ?
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (session_id, lim),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def upsert_artifact(
    session_id: str,
    *,
    kind: str,
    title: str = "",
    status: str = "drafting",
    content: str | None = None,
    uri: str | None = None,
    rel_path: str | None = None,
    turn_id: str | None = None,
    artifact_id: str | None = None,
    meta: dict[str, Any] | None = None,
    replace_content: bool = True,
) -> dict[str, Any]:
    """Create or update an artifact. When replace_content is False, keep existing content."""
    ensure_artifact_table()
    kind = (kind or "").strip().lower()
    if kind not in _KINDS:
        raise ValueError(f"invalid kind: {kind}")
    status = (status or "drafting").strip().lower()
    if status not in _STATUSES:
        raise ValueError(f"invalid status: {status}")

    now = _now()
    aid = (artifact_id or "").strip() or str(uuid.uuid4())
    existing = get_artifact(aid) if artifact_id else None

    if existing and existing.get("session_id") != session_id:
        raise ValueError("artifact session mismatch")

    if existing:
        body = content if replace_content and content is not None else existing.get("content") or ""
        title_v = title if title.strip() else (existing.get("title") or "")
        uri_v = uri if uri is not None else existing.get("uri")
        path_v = rel_path if rel_path is not None else existing.get("rel_path")
        turn_v = turn_id or existing.get("turn_id")
        meta_v = meta if meta is not None else (existing.get("meta") or {})
        version = int(existing.get("version") or 1) + 1
        with library_db._connect() as conn:  # noqa: SLF001
            conn.execute(
                """
                UPDATE agent_artifacts SET
                  turn_id = ?, kind = ?, title = ?, status = ?,
                  uri = ?, rel_path = ?, content = ?, meta_json = ?,
                  version = ?, updated_at = ?
                WHERE artifact_id = ?
                """,
                (
                    turn_v,
                    kind,
                    title_v,
                    status,
                    uri_v,
                    path_v,
                    body,
                    json.dumps(meta_v, ensure_ascii=False, default=str),
                    version,
                    now,
                    aid,
                ),
            )
            conn.commit()
    else:
        body = content or ""
        meta_v = meta or {}
        with library_db._connect() as conn:  # noqa: SLF001
            conn.execute(
                """
                INSERT INTO agent_artifacts (
                  artifact_id, session_id, turn_id, kind, title, status,
                  uri, rel_path, content, meta_json, version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    aid,
                    session_id,
                    turn_id,
                    kind,
                    title.strip() or ("报告" if kind == "report" else "产物"),
                    status,
                    uri,
                    rel_path,
                    body,
                    json.dumps(meta_v, ensure_ascii=False, default=str),
                    now,
                    now,
                ),
            )
            conn.commit()

    out = get_artifact(aid)
    assert out is not None
    return out


def append_delta(
    session_id: str,
    artifact_id: str,
    chunk: str,
    *,
    title: str | None = None,
    status: str = "drafting",
    turn_id: str | None = None,
) -> dict[str, Any]:
    """Append text to a report artifact (creates if missing)."""
    ensure_artifact_table()
    aid = (artifact_id or "").strip()
    piece = chunk or ""
    if not aid:
        raise ValueError("artifact_id is required for append")
    existing = get_artifact(aid)
    if existing and existing.get("session_id") != session_id:
        raise ValueError("artifact session mismatch")
    if not existing:
        return upsert_artifact(
            session_id,
            kind="report",
            title=title or "报告",
            status=status,
            content=piece,
            turn_id=turn_id,
            artifact_id=aid,
        )
    now = _now()
    body = (existing.get("content") or "") + piece
    title_v = title.strip() if title and title.strip() else (existing.get("title") or "报告")
    status_v = (status or existing.get("status") or "drafting").strip().lower()
    if status_v not in _STATUSES:
        status_v = "drafting"
    version = int(existing.get("version") or 1) + 1
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            UPDATE agent_artifacts SET
              content = ?, title = ?, status = ?, turn_id = COALESCE(?, turn_id),
              version = ?, updated_at = ?
            WHERE artifact_id = ?
            """,
            (body, title_v, status_v, turn_id, version, now, aid),
        )
        conn.commit()
    out = get_artifact(aid)
    assert out is not None
    return out


def delete_artifact(session_id: str, artifact_id: str) -> bool:
    """Delete one artifact bound to the session. Returns False if missing."""
    ensure_artifact_table()
    with library_db._connect() as conn:  # noqa: SLF001
        cur = conn.execute(
            "DELETE FROM agent_artifacts WHERE session_id = ? AND artifact_id = ?",
            (session_id, artifact_id),
        )
        conn.commit()
        return cur.rowcount > 0


def update_artifact(
    session_id: str,
    artifact_id: str,
    *,
    title: str | None = None,
    status: str | None = None,
) -> dict[str, Any] | None:
    """Rename / change status for a session-bound artifact."""
    ensure_artifact_table()
    existing = get_artifact(artifact_id)
    if not existing or existing.get("session_id") != session_id:
        return None
    title_v = existing.get("title") or ""
    if title is not None:
        title_v = title.strip() or title_v
    status_v = existing.get("status") or "drafting"
    if status is not None:
        status_n = status.strip().lower()
        if status_n not in _STATUSES:
            raise ValueError(f"invalid status: {status}")
        status_v = status_n
    now = _now()
    version = int(existing.get("version") or 1) + 1
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            UPDATE agent_artifacts SET
              title = ?, status = ?, version = ?, updated_at = ?
            WHERE artifact_id = ? AND session_id = ?
            """,
            (title_v, status_v, version, now, artifact_id, session_id),
        )
        conn.commit()
    return get_artifact(artifact_id)


def delete_session_artifacts(session_id: str) -> None:
    ensure_artifact_table()
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute("DELETE FROM agent_artifacts WHERE session_id = ?", (session_id,))
        conn.commit()


def public_view(art: dict[str, Any], *, include_content: bool = True) -> dict[str, Any]:
    """Shape returned to API / SSE clients."""
    out: dict[str, Any] = {
        "artifact_id": art.get("artifact_id"),
        "session_id": art.get("session_id"),
        "turn_id": art.get("turn_id"),
        "kind": art.get("kind"),
        "title": art.get("title") or "",
        "status": art.get("status") or "drafting",
        "uri": art.get("uri"),
        "rel_path": art.get("rel_path"),
        "meta": art.get("meta") or {},
        "version": int(art.get("version") or 1),
        "created_at": art.get("created_at"),
        "updated_at": art.get("updated_at"),
    }
    if include_content:
        out["content"] = art.get("content") or ""
    else:
        out["chars"] = len(art.get("content") or "")
    return out
