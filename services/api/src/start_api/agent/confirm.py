"""Confirm gate for costly tools (parse / translate)."""

from __future__ import annotations

import threading
from typing import Any

_lock = threading.Lock()
_waiters: dict[str, dict[str, Any]] = {}


def _key(session_id: str, turn_id: str, confirm_id: str) -> str:
    return f"{session_id}:{turn_id}:{confirm_id}"


def begin_wait(session_id: str, turn_id: str, confirm_id: str, payload: dict[str, Any]) -> None:
    with _lock:
        _waiters[_key(session_id, turn_id, confirm_id)] = {
            "event": threading.Event(),
            "approved": False,
            "payload": payload,
        }


def resolve(session_id: str, turn_id: str, confirm_id: str, *, approved: bool) -> bool:
    with _lock:
        slot = _waiters.get(_key(session_id, turn_id, confirm_id))
        if not slot:
            return False
        slot["approved"] = bool(approved)
        slot["event"].set()
        return True


def wait_approved(
    session_id: str,
    turn_id: str,
    confirm_id: str,
    *,
    timeout: float,
    cancel: threading.Event | None = None,
) -> bool | None:
    """True=approved, False=rejected, None=timeout/cancel/missing."""
    key = _key(session_id, turn_id, confirm_id)
    with _lock:
        slot = _waiters.get(key)
        if not slot:
            return None
        ev: threading.Event = slot["event"]

    deadline = time_monotonic() + timeout
    while True:
        if cancel is not None and cancel.is_set():
            with _lock:
                slot = _waiters.pop(key, None)
            if slot:
                slot["approved"] = False
                slot["event"].set()
            return None
        remaining = deadline - time_monotonic()
        if remaining <= 0:
            with _lock:
                slot = _waiters.pop(key, None)
            if slot:
                slot["approved"] = False
                slot["event"].set()
            return None
        if ev.wait(timeout=min(0.5, remaining)):
            break

    with _lock:
        slot = _waiters.pop(key, None)
    if not slot:
        return None
    return bool(slot.get("approved"))


def time_monotonic() -> float:
    import time

    return time.monotonic()


def cancel_turn_waits(session_id: str, turn_id: str) -> None:
    prefix = f"{session_id}:{turn_id}:"
    with _lock:
        keys = [k for k in _waiters if k.startswith(prefix)]
        for k in keys:
            slot = _waiters.pop(k)
            slot["approved"] = False
            slot["event"].set()
