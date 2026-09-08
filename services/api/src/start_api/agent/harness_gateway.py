"""DeepSeek Harness gateway — dsh profile=sdk is the agent brain."""

from __future__ import annotations

import json
import os
import queue
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from deepseek_harness import DeepSeekHarness, Notification

from start_api.agent import session_log
from start_api.agent.notify_bridge import bridge_notification

_PATCH_TEMPLATE = Path(__file__).resolve().parent / "dsh_patches" / "mcp_start.yml"

_DATA_ROOT = Path(os.getenv("START_DATA_DIR", Path(__file__).resolve().parents[3] / ".data"))
_DEFAULT_DSH_HOME = _DATA_ROOT / "dsh_home"
_DEFAULT_WORKSPACE = _DATA_ROOT / "dsh_workspace"

_PERSONA = (
    "You are StarT's local research assistant. "
    "Prefer DeepSeek Harness tools for web research, todos, goals, and subagents. "
    "Use StarT MCP tools (mcp__start__*) for the local paper library: health_check, "
    "library_search/get/update, upload_from_url, parse_document, translate_document, "
    "get_paper_text, export_citation, get_task_status. "
    "Do not invent parse/translate results; call tools. Reply in concise Chinese Markdown "
    "with upload_id / task_id when relevant. "
    "If the user asks to stop, cancel, skip, or not parse/translate further, do not call more "
    "tools—acknowledge briefly and wait for the next instruction."
)

_lock = threading.Lock()
_run_lock = threading.Lock()
_harness: DeepSeekHarness | None = None
_cancel_flags: dict[str, threading.Event] = {}
_cancel_lock = threading.Lock()
_active_turn_id: str | None = None
_active_session_id: str | None = None
_active_lock = threading.Lock()
# StarT session_id → dsh session id valid only for the current live runtime process.
_dsh_alias: dict[str, str] = {}
_dsh_alias_lock = threading.Lock()


def interrupt_session(session_id: str) -> dict[str, Any]:
    """Cancel the in-flight turn for this session.

    Idle runtimes are left alive: killing them breaks multi-turn resume for the
    next prompt (SDK cannot load a persisted session id in a fresh process).
    """
    with _active_lock:
        active_sid = _active_session_id
        active_tid = _active_turn_id
    if active_tid and (not active_sid or active_sid == session_id):
        cancelled = request_cancel(active_tid)
        if cancelled:
            session_log.update_turn(cancelled, status="cancelled", error="user interrupted")
        return {"ok": True, "turn_id": cancelled, "interrupted": True}
    return {"ok": True, "turn_id": None, "interrupted": False}


def request_cancel(turn_id: str | None = None) -> str | None:
    """Mark active turn cancelled and kill the dsh runtime (SDK has no cancel RPC).

    @returns The turn_id that was cancelled, if any.
    """
    with _active_lock:
        target = turn_id or _active_turn_id
    if not target:
        return None
    with _cancel_lock:
        ev = _cancel_flags.get(target)
        if ev is None:
            ev = threading.Event()
            _cancel_flags[target] = ev
        ev.set()
    shutdown()
    return target


def _cancel_event(turn_id: str) -> threading.Event:
    with _cancel_lock:
        ev = _cancel_flags.get(turn_id)
        if ev is None:
            ev = threading.Event()
            _cancel_flags[turn_id] = ev
        return ev


def _clear_cancel(turn_id: str) -> None:
    with _cancel_lock:
        _cancel_flags.pop(turn_id, None)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"data: {json.dumps({'event': event, **data}, ensure_ascii=False, default=str)}\n\n"


def _emit(
    session_id: str,
    turn_id: str,
    etype: str,
    payload: dict[str, Any] | None = None,
    *,
    sse_event: str | None = None,
) -> str:
    body = payload or {}
    if etype == "assistant_delta":
        return _sse(
            "assistant_delta",
            {"session_id": session_id, "turn_id": turn_id, **body},
        )
    ev = session_log.append_event(session_id, etype, body, turn_id=turn_id)
    return _sse(
        sse_event or etype,
        {
            "session_id": session_id,
            "turn_id": turn_id,
            "seq": ev["seq"],
            "event_id": ev["event_id"],
            **body,
        },
    )


def _mcp_url() -> str:
    explicit = (os.getenv("START_MCP_URL") or "").strip()
    if explicit:
        return explicit.rstrip("/")
    port = os.getenv("START_API_PORT", "8080")
    host = os.getenv("START_MCP_HOST", "127.0.0.1")
    return f"http://{host}:{port}/mcp"


def _write_runtime_patch(dsh_home: Path) -> Path:
    template = _PATCH_TEMPLATE.read_text(encoding="utf-8")
    body = template.replace("__START_MCP_URL__", _mcp_url())
    out_dir = dsh_home / "start_patches"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "mcp_start.yml"
    out.write_text(body, encoding="utf-8")
    return out


def _llm_env() -> dict[str, str]:
    """Resolve API credentials for the dsh subprocess (settings file and/or env)."""
    from start_api.llm_config import load_llm_config

    api_key, base_url, model = load_llm_config()
    out: dict[str, str] = {}
    if api_key:
        out["DEEPSEEK_API_KEY"] = api_key
        # Keep in-process env in sync so later getenv paths see the same key.
        os.environ["DEEPSEEK_API_KEY"] = api_key
    if base_url:
        out["DEEPSEEK_BASE_URL"] = base_url
        os.environ["DEEPSEEK_BASE_URL"] = base_url
    if model:
        out.setdefault("DEEPSEEK_MODEL", model)
    for key in ("DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL", "DEEPSEEK_MODEL"):
        val = (os.getenv(key) or "").strip()
        if val and key not in out:
            out[key] = val
    return out


def _ensure_harness() -> DeepSeekHarness:
    global _harness
    with _lock:
        if _harness is not None:
            return _harness

        dsh_home = Path(os.getenv("START_DSH_HOME", str(_DEFAULT_DSH_HOME))).expanduser().resolve()
        workspace = Path(os.getenv("START_DSH_WORKSPACE", str(_DEFAULT_WORKSPACE))).expanduser().resolve()
        dsh_home.mkdir(parents=True, exist_ok=True)
        workspace.mkdir(parents=True, exist_ok=True)
        patch = _write_runtime_patch(dsh_home)

        env: dict[str, str] = {
            "DSH_PERMISSION_MODE": os.getenv("DSH_PERMISSION_MODE", "danger-full-access"),
            "DSH_SYSTEM_PROMPT": os.getenv("DSH_SYSTEM_PROMPT", _PERSONA),
            "DSH_TELEMETRY_DISABLED": os.getenv("DSH_TELEMETRY_DISABLED", "1"),
        }
        env.update(_llm_env())
        if not env.get("DEEPSEEK_API_KEY"):
            raise RuntimeError(
                "未配置 DEEPSEEK_API_KEY：请在 StarT 设置里保存 API Key，或设置环境变量后再试。"
            )

        kwargs: dict[str, Any] = {
            "profile": "sdk",
            "dsh_home": str(dsh_home),
            "cwd": str(workspace),
            "patches": (str(patch),),
            "env": env,
            "initialize_timeout_seconds": float(os.getenv("START_DSH_INIT_TIMEOUT", "60")),
        }
        dsh_bin = (os.getenv("START_DSH_BIN") or "").strip()
        if dsh_bin:
            kwargs["dsh_bin"] = dsh_bin
        model = (os.getenv("START_DSH_MODEL") or env.get("DEEPSEEK_MODEL") or "").strip()
        if model:
            kwargs["model"] = model
        provider = (os.getenv("START_DSH_PROVIDER") or "").strip()
        if provider:
            kwargs["provider"] = provider

        harness = DeepSeekHarness(**kwargs)
        harness.start()
        _harness = harness
        return harness


def shutdown() -> None:
    """Force-kill the dsh subprocess (graceful close can hang mid-run)."""
    global _harness
    with _lock:
        harness = _harness
        _harness = None
    with _dsh_alias_lock:
        _dsh_alias.clear()
    if harness is None:
        return
    try:
        client = harness.client
        proc = getattr(client, "_proc", None)
        if proc is not None and proc.poll() is None:
            try:
                if proc.stdin:
                    proc.stdin.close()
            except Exception:  # noqa: BLE001
                pass
            try:
                proc.kill()
            except Exception:  # noqa: BLE001
                pass
            try:
                proc.wait(timeout=2.0)
            except Exception:  # noqa: BLE001
                pass
            try:
                client._proc = None  # noqa: SLF001
                client._fail_waiters(client._runtime_closed_error("interrupted"))  # noqa: SLF001
            except Exception:  # noqa: BLE001
                pass
        else:
            try:
                harness.close()
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        try:
            harness.close()
        except Exception:  # noqa: BLE001
            pass


def _resolve_dsh_session(start_session_id: str, turn_id: str) -> str:
    """Mint a fresh dsh session id for this StarT turn.

    The SDK cannot resume a persisted session id in a new process, and an id that
    once idled empty stays empty. StarT continuity comes from injected history.
    """
    fresh = f"start-{start_session_id[:8]}-{turn_id}"
    with _dsh_alias_lock:
        _dsh_alias[start_session_id] = fresh
    return fresh


def _history_for_prompt(session_id: str, *, exclude_turn_id: str, max_msgs: int = 20) -> str:
    """Build a short text history from StarT's durable log for a fresh dsh session."""
    events = session_log.list_events(session_id, after_seq=0, limit=2000)
    lines: list[str] = []
    for ev in events:
        if ev.get("turn_id") == exclude_turn_id:
            continue
        t = ev.get("type")
        p = ev.get("payload") or {}
        if t == "user_message":
            text = str(p.get("content") or p.get("goal") or "").strip()
            if text:
                lines.append(f"User: {text}")
        elif t == "assistant_message":
            if p.get("source") == "cancel":
                lines.append("Assistant: [interrupted by user]")
                continue
            text = str(p.get("content") or "").strip()
            if text:
                lines.append(f"Assistant: {text}")
    if not lines:
        return ""
    return "\n".join(lines[-max_msgs:])


def _compose_prompt(session_id: str, turn_id: str, goal: str) -> str:
    hist = _history_for_prompt(session_id, exclude_turn_id=turn_id)
    if not hist:
        return goal
    return (
        "Earlier turns in this StarT chat (for continuity):\n"
        f"{hist}\n\n"
        f"Current user request:\n{goal}"
    )


def run_turn(session_id: str, turn_id: str, goal: str) -> Iterator[str]:
    """SSE generator: drive one dsh run and bridge notifications."""
    global _active_turn_id, _active_session_id
    cancel = _cancel_event(turn_id)
    q: queue.Queue[str | None] = queue.Queue()
    error_holder: list[BaseException] = []

    with _active_lock:
        _active_turn_id = turn_id
        _active_session_id = session_id

    yield _emit(
        session_id,
        turn_id,
        "turn_start",
        {"goal": goal, "engine": "deepseek-harness", "profile": "sdk"},
    )
    yield _emit(session_id, turn_id, "user_message", {"content": goal, "goal": goal})

    saw_assistant = {"ok": False}
    call_names: dict[str, str] = {}
    pending_call_ids: list[str] = []

    def on_notification_tracked(notification: Notification) -> None:
        if cancel.is_set():
            return
        for etype, body in bridge_notification(notification):
            if etype == "assistant_message":
                saw_assistant["ok"] = True
            if etype == "tool_call":
                cid = str(body.get("tool_call_id") or "")
                name = str(body.get("tool") or "")
                if cid and name:
                    call_names[cid] = name
                if cid:
                    pending_call_ids.append(cid)
            if etype == "tool_result":
                cid = str(body.get("tool_call_id") or "")
                if not cid and pending_call_ids:
                    cid = pending_call_ids.pop(0)
                    body["tool_call_id"] = cid
                elif cid and cid in pending_call_ids:
                    pending_call_ids.remove(cid)
                if cid and call_names.get(cid) and body.get("tool") in {"", "tool", None}:
                    body["tool"] = call_names[cid]
            q.put(_emit(session_id, turn_id, etype, body))

    def worker() -> None:
        try:
            with _run_lock:
                if cancel.is_set():
                    return
                harness = _ensure_harness()
                # Fresh dsh session every StarT turn; continuity via StarT history.
                dsh_sid = _resolve_dsh_session(session_id, turn_id)
                prompt = _compose_prompt(session_id, turn_id, goal)
                result = harness.run(
                    prompt,
                    session_id=dsh_sid,
                    on_notification=on_notification_tracked,
                )

            if cancel.is_set():
                return
            text = (result.final_response or "").strip()
            if text and not saw_assistant["ok"]:
                q.put(
                    _emit(
                        session_id,
                        turn_id,
                        "assistant_message",
                        {"content": text, "source": "final_response"},
                    )
                )
            elif not saw_assistant["ok"] and not text:
                detail = "助手没有返回内容。"
                events = getattr(result, "events", None) or []
                if events:
                    detail += f"（runtime 产生了 {len(events)} 条事件但无助手文本）"
                else:
                    detail += "请确认 API Key 已配置，或新建会话后再试。"
                q.put(
                    _emit(
                        session_id,
                        turn_id,
                        "error",
                        {"message": detail},
                    )
                )
        except BaseException as exc:  # noqa: BLE001
            if cancel.is_set():
                # Expected when request_cancel() closes the runtime mid-run.
                return
            error_holder.append(exc)
        finally:
            q.put(None)

    thread = threading.Thread(target=worker, name=f"dsh-turn-{turn_id[:8]}", daemon=True)
    thread.start()

    try:
        cancel_wait_started: float | None = None
        while True:
            try:
                item = q.get(timeout=0.4)
            except queue.Empty:
                if not cancel.is_set():
                    continue
                if cancel_wait_started is None:
                    cancel_wait_started = time.monotonic()
                if not thread.is_alive() or (time.monotonic() - cancel_wait_started) > 3.0:
                    break
                continue
            if item is None:
                break
            if cancel.is_set():
                # Drop late notifications after interrupt; wait for worker sentinel.
                continue
            yield item

        if cancel.is_set():
            session_log.update_turn(turn_id, status="cancelled", error="user interrupted")
            yield _emit(
                session_id,
                turn_id,
                "assistant_message",
                {"content": "已中断当前执行。", "source": "cancel"},
            )
            yield _emit(session_id, turn_id, "turn_end", {"status": "cancelled"})
            return

        if error_holder:
            exc = error_holder[0]
            msg = str(exc) or exc.__class__.__name__
            yield _emit(session_id, turn_id, "error", {"message": msg})
            session_log.update_turn(turn_id, status="failed", error=msg)
            yield _emit(session_id, turn_id, "turn_end", {"status": "failed"})
            return

        session_log.update_turn(turn_id, status="done")
        yield _emit(session_id, turn_id, "turn_end", {"status": "done"})
    finally:
        with _active_lock:
            if _active_turn_id == turn_id:
                _active_turn_id = None
                _active_session_id = None
        _clear_cancel(turn_id)
        thread.join(timeout=2.0)
