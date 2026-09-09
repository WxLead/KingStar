"""Append-only agent session event log (model-visible ⟺ logged)."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from start_api import db as library_db

# Event types that become chat messages for the model
_USER_TYPES = {"user_message"}
_ASSISTANT_TYPES = {"assistant_message"}
_TOOL_CALL_TYPES = {"tool_call"}
_TOOL_RESULT_TYPES = {"tool_result"}
_SUMMARY_TYPES = {"compact_summary"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_agent_tables() -> None:
    with library_db._connect() as conn:  # noqa: SLF001
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_sessions (
              session_id TEXT PRIMARY KEY,
              title TEXT,
              status TEXT NOT NULL DEFAULT 'active',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS agent_turns (
              turn_id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              goal TEXT NOT NULL,
              status TEXT NOT NULL,
              model TEXT,
              error TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_events (
              event_id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              turn_id TEXT,
              seq INTEGER NOT NULL,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_agent_events_session_seq
              ON agent_events(session_id, seq);
            CREATE INDEX IF NOT EXISTS idx_agent_turns_session
              ON agent_turns(session_id, created_at);
            """
        )
        conn.commit()


def create_session(*, title: str = "") -> dict[str, Any]:
    ensure_agent_tables()
    sid = str(uuid.uuid4())
    now = _now()
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            INSERT INTO agent_sessions (session_id, title, status, created_at, updated_at)
            VALUES (?, ?, 'active', ?, ?)
            """,
            (sid, title or "研究助手", now, now),
        )
        conn.commit()
    return {"session_id": sid, "title": title or "研究助手", "status": "active", "created_at": now, "updated_at": now}


def get_session(session_id: str) -> dict[str, Any] | None:
    ensure_agent_tables()
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM agent_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        return dict(row) if row else None


def list_sessions(limit: int = 30) -> list[dict[str, Any]]:
    ensure_agent_tables()
    lim = max(1, min(limit, 100))
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM agent_sessions
            WHERE status = 'active'
            ORDER BY updated_at DESC
            LIMIT ?
            """,
            (lim,),
        ).fetchall()
        return [dict(r) for r in rows]


def touch_session(session_id: str, *, title: str | None = None) -> None:
    fields = ["updated_at = ?"]
    vals: list[Any] = [_now()]
    if title is not None:
        fields.append("title = ?")
        vals.append(title)
    vals.append(session_id)
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(f"UPDATE agent_sessions SET {', '.join(fields)} WHERE session_id = ?", vals)
        conn.commit()


def archive_session(session_id: str) -> None:
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(
            "UPDATE agent_sessions SET status = 'archived', updated_at = ? WHERE session_id = ?",
            (_now(), session_id),
        )
        conn.commit()


def delete_session(session_id: str) -> bool:
    """Hard-delete a session and its turns/events. Returns False if missing."""
    ensure_agent_tables()
    with library_db._connect() as conn:  # noqa: SLF001
        row = conn.execute(
            "SELECT session_id FROM agent_sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if not row:
            return False
        conn.execute("DELETE FROM agent_events WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM agent_turns WHERE session_id = ?", (session_id,))
        conn.execute("DELETE FROM agent_sessions WHERE session_id = ?", (session_id,))
        conn.commit()
    return True


def create_turn(session_id: str, goal: str, *, model: str = "") -> dict[str, Any]:
    ensure_agent_tables()
    tid = str(uuid.uuid4())
    now = _now()
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(
            """
            INSERT INTO agent_turns (turn_id, session_id, goal, status, model, error, created_at, updated_at)
            VALUES (?, ?, ?, 'running', ?, NULL, ?, ?)
            """,
            (tid, session_id, goal, model, now, now),
        )
        conn.commit()
    touch_session(session_id, title=(goal[:40] + ("…" if len(goal) > 40 else "")))
    return {"turn_id": tid, "session_id": session_id, "goal": goal, "status": "running", "model": model}


def update_turn(
    turn_id: str,
    *,
    status: str | None = None,
    error: str | None = None,
    model: str | None = None,
) -> None:
    fields = ["updated_at = ?"]
    vals: list[Any] = [_now()]
    if status is not None:
        fields.append("status = ?")
        vals.append(status)
    if error is not None:
        fields.append("error = ?")
        vals.append(error)
    if model is not None:
        fields.append("model = ?")
        vals.append(model)
    vals.append(turn_id)
    with library_db._connect() as conn:  # noqa: SLF001
        conn.execute(f"UPDATE agent_turns SET {', '.join(fields)} WHERE turn_id = ?", vals)
        conn.commit()


def get_turn(turn_id: str) -> dict[str, Any] | None:
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM agent_turns WHERE turn_id = ?", (turn_id,)).fetchone()
        return dict(row) if row else None


def _next_seq(conn: sqlite3.Connection, session_id: str) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(seq), 0) FROM agent_events WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    return int(row[0]) + 1


def append_event(
    session_id: str,
    type: str,
    payload: dict[str, Any] | None = None,
    *,
    turn_id: str | None = None,
) -> dict[str, Any]:
    ensure_agent_tables()
    eid = str(uuid.uuid4())
    now = _now()
    body = payload or {}
    with library_db._connect() as conn:  # noqa: SLF001
        seq = _next_seq(conn, session_id)
        conn.execute(
            """
            INSERT INTO agent_events (event_id, session_id, turn_id, seq, type, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (eid, session_id, turn_id, seq, type, json.dumps(body, ensure_ascii=False, default=str), now),
        )
        conn.execute(
            "UPDATE agent_sessions SET updated_at = ? WHERE session_id = ?",
            (now, session_id),
        )
        conn.commit()
    return {
        "event_id": eid,
        "session_id": session_id,
        "turn_id": turn_id,
        "seq": seq,
        "type": type,
        "payload": body,
        "created_at": now,
    }


def list_events(session_id: str, *, after_seq: int = 0, limit: int = 2000) -> list[dict[str, Any]]:
    ensure_agent_tables()
    lim = max(1, min(limit, 5000))
    with library_db._connect() as conn:  # noqa: SLF001
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT * FROM agent_events
            WHERE session_id = ? AND seq > ?
            ORDER BY seq ASC
            LIMIT ?
            """,
            (session_id, after_seq, lim),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            item = dict(r)
            try:
                item["payload"] = json.loads(item.pop("payload_json") or "{}")
            except json.JSONDecodeError:
                item["payload"] = {"raw": item.pop("payload_json", "")}
            out.append(item)
        return out


def derive_messages(session_id: str, *, max_events: int = 400) -> list[dict[str, Any]]:
    """Rebuild OpenAI-style messages from the durable log (skip deltas)."""
    events = list_events(session_id, after_seq=0, limit=max_events)
    messages: list[dict[str, Any]] = []
    pending_tools: list[dict[str, Any]] = []

    def flush_tools() -> None:
        nonlocal pending_tools
        if not pending_tools:
            return
        messages.append({"role": "assistant", "content": None, "tool_calls": pending_tools})
        pending_tools = []

    for ev in events:
        t = ev.get("type")
        p = ev.get("payload") or {}
        if t in _SUMMARY_TYPES:
            flush_tools()
            text = str(p.get("text") or p.get("summary") or "").strip()
            if text:
                messages.append({"role": "system", "content": f"[会话摘要]\n{text}"})
        elif t in _USER_TYPES:
            flush_tools()
            content = str(p.get("content") or p.get("goal") or "").strip()
            if content:
                messages.append({"role": "user", "content": content})
        elif t in _ASSISTANT_TYPES:
            flush_tools()
            content = str(p.get("content") or "").strip()
            if content:
                messages.append({"role": "assistant", "content": content})
        elif t in _TOOL_CALL_TYPES:
            pending_tools.append(
                {
                    "id": p.get("tool_call_id") or f"call_{ev.get('seq')}",
                    "type": "function",
                    "function": {
                        "name": p.get("tool") or p.get("name") or "",
                        "arguments": json.dumps(p.get("arguments") or {}, ensure_ascii=False),
                    },
                }
            )
        elif t in _TOOL_RESULT_TYPES:
            if pending_tools:
                flush_tools()
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": p.get("tool_call_id") or f"call_{ev.get('seq')}",
                    "content": json.dumps(p.get("result") or p, ensure_ascii=False, default=str)[:20_000],
                }
            )
    flush_tools()
    return messages


def truncate_from_turn(session_id: str, turn_id: str) -> dict[str, Any] | None:
    """Delete this turn and all later turns/events so the session can be rewritten from here."""
    ensure_agent_tables()
    turn = get_turn(turn_id)
    if not turn or turn.get("session_id") != session_id:
        return None
    with library_db._connect() as conn:  # noqa: SLF001
        rows = conn.execute(
            """
            SELECT turn_id FROM agent_turns
            WHERE session_id = ?
            ORDER BY created_at ASC, turn_id ASC
            """,
            (session_id,),
        ).fetchall()
        ordered = [str(r[0]) for r in rows]
        if turn_id not in ordered:
            return None
        drop = ordered[ordered.index(turn_id) :]
        placeholders = ",".join("?" * len(drop))
        min_row = conn.execute(
            f"""
            SELECT MIN(seq) FROM agent_events
            WHERE session_id = ? AND turn_id IN ({placeholders})
            """,
            (session_id, *drop),
        ).fetchone()
        min_seq = min_row[0] if min_row else None
        if min_seq is not None:
            conn.execute(
                "DELETE FROM agent_events WHERE session_id = ? AND seq >= ?",
                (session_id, int(min_seq)),
            )
        conn.execute(
            f"DELETE FROM agent_events WHERE session_id = ? AND turn_id IN ({placeholders})",
            (session_id, *drop),
        )
        conn.execute(
            f"DELETE FROM agent_turns WHERE session_id = ? AND turn_id IN ({placeholders})",
            (session_id, *drop),
        )
        conn.execute(
            "UPDATE agent_sessions SET updated_at = ? WHERE session_id = ?",
            (_now(), session_id),
        )
        conn.commit()
    return {"ok": True, "session_id": session_id, "removed_turn_ids": drop}
