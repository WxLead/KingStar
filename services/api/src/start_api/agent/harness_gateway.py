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
    "You are KingStar's local research assistant. "
    "Prefer DeepSeek Harness tools for web research, todos, goals, and subagents. "
    "Use KingStar MCP tools (mcp__start__*) for the local paper library: health_check, "
    "library_search/get/update, upload_from_url, parse_document, translate_document, "
    "get_paper_text, export_citation, get_task_status, publish_report. "
    "For research briefs / surveys / written reports, stream the deliverable with "
    "publish_report (append chunks, then status=ready)—do not only paste long reports in chat. "
    "Stay inside the current session workspace directory. "
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
# Live SSE sink for the in-flight turn (MCP tools / bridges push here).
_active_emit_q: queue.Queue[str | None] | None = None
# KingStar session_id → dsh session id valid only for the current live runtime process.
_dsh_alias: dict[str, str] = {}
_dsh_alias_lock = threading.Lock()


def get_active_turn() -> tuple[str | None, str | None]:
    with _active_lock:
        return _active_session_id, _active_turn_id


def push_turn_sse(etype: str, payload: dict[str, Any] | None = None, *, persist: bool = False) -> bool:
    """Push an SSE frame onto the active turn queue. Returns False if no live turn."""
    body = payload or {}
    with _active_lock:
        sid = _active_session_id
        tid = _active_turn_id
        q = _active_emit_q
    if not sid or not tid or q is None:
        return False
    if persist:
        frame = _emit(sid, tid, etype, body)
    else:
        frame = _sse(etype, {"session_id": sid, "turn_id": tid, **body})
    q.put(frame)
    return True


def session_workspace(session_id: str) -> Path:
    root = Path(os.getenv("START_DSH_WORKSPACE", str(_DEFAULT_WORKSPACE))).expanduser().resolve()
    path = root / "sessions" / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


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


def _ensure_harness(session_id: str | None = None) -> DeepSeekHarness:
    global _harness
    workspace_root = Path(
        os.getenv("START_DSH_WORKSPACE", str(_DEFAULT_WORKSPACE))
    ).expanduser().resolve()
    workspace_root.mkdir(parents=True, exist_ok=True)
    cwd = session_workspace(session_id) if session_id else workspace_root
    cwd_s = str(cwd)

    with _lock:
        if _harness is not None and getattr(_harness, "_start_cwd", None) == cwd_s:
            return _harness

    # Session workspace changed (or first start) — recycle runtime.
    if _harness is not None:
        shutdown()

    with _lock:
        if _harness is not None and getattr(_harness, "_start_cwd", None) == cwd_s:
            return _harness

        dsh_home = Path(os.getenv("START_DSH_HOME", str(_DEFAULT_DSH_HOME))).expanduser().resolve()
        dsh_home.mkdir(parents=True, exist_ok=True)
        patch = _write_runtime_patch(dsh_home)

        env: dict[str, str] = {
            "DSH_PERMISSION_MODE": os.getenv("DSH_PERMISSION_MODE", "danger-full-access"),
            "DSH_SYSTEM_PROMPT": os.getenv("DSH_SYSTEM_PROMPT", _PERSONA),
            "DSH_TELEMETRY_DISABLED": os.getenv("DSH_TELEMETRY_DISABLED", "1"),
        }
        env.update(_llm_env())
        if not env.get("DEEPSEEK_API_KEY"):
            raise RuntimeError(
                "未配置 DEEPSEEK_API_KEY：请在 KingStar 设置里保存 API Key，或设置环境变量后再试。"
            )

        kwargs: dict[str, Any] = {
            "profile": "sdk",
            "dsh_home": str(dsh_home),
            "cwd": cwd_s,
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
        setattr(harness, "_start_cwd", cwd_s)
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
    """Mint a fresh dsh session id for this KingStar turn.

    The SDK cannot resume a persisted session id in a new process, and an id that
    once idled empty stays empty. KingStar continuity comes from injected history.
    """
    fresh = f"start-{start_session_id[:8]}-{turn_id}"
    with _dsh_alias_lock:
        _dsh_alias[start_session_id] = fresh
    return fresh


def _history_for_prompt(session_id: str, *, exclude_turn_id: str, max_msgs: int = 20) -> str:
    """Build a short text history from KingStar's durable log for a fresh dsh session."""
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


_BRIEF_HINTS = (
    "调研",
    "简报",
    "综述",
    "报告",
    "进展",
    "survey",
    "brief",
    "research",
    "literature review",
)


def _load_skill(name: str) -> str:
    path = Path(__file__).resolve().parent / "skills" / name / "SKILL.md"
    try:
        return path.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def _artifacts_for_prompt(session_id: str, *, max_excerpt: int = 2800) -> str:
    """Tell the model which reports already exist so continue/rewrite can append."""
    from start_api.agent import artifacts

    try:
        items = artifacts.list_artifacts(session_id, limit=30)
    except Exception:  # noqa: BLE001
        return ""
    if not items:
        return ""

    lines = [
        "Existing KingStar session artifacts (IMPORTANT):",
        "- If the user asks to continue / 续写 / 接着写 a report that is still drafting (or ready), "
        "you MUST call mcp__start__publish_report with that exact artifact_id and mode=\"append\".",
        "- Do NOT create a new report with mode=\"replace\" unless the user explicitly wants a new document.",
    ]
    for art in items:
        if art.get("status") == "archived":
            continue
        kind = art.get("kind") or "file"
        aid = art.get("artifact_id")
        title = art.get("title") or ""
        status = art.get("status") or ""
        body = art.get("content") or ""
        uri = art.get("uri") or ""
        lines.append(
            f"- kind={kind} status={status} artifact_id={aid} title={title!r} chars={len(body)}"
            + (f" uri={uri}" if uri else "")
        )
        if kind == "report" and body.strip():
            excerpt = body[-max_excerpt:] if len(body) > max_excerpt else body
            prefix = "…(earlier omitted)\n" if len(body) > max_excerpt else ""
            lines.append(f"  content_tail:\n```markdown\n{prefix}{excerpt}\n```")
    return "\n".join(lines)


_CONTINUE_HINTS = (
    "续写",
    "继续写",
    "接着写",
    "继续",
    "接着",
    "完成报告",
    "写完",
    "continue",
    "resume",
)


def _compose_prompt(session_id: str, turn_id: str, goal: str) -> str:
    parts: list[str] = []
    hist = _history_for_prompt(session_id, exclude_turn_id=turn_id)
    if hist:
        parts.append("Earlier turns in this KingStar chat (for continuity):\n" + hist)

    artifact_ctx = _artifacts_for_prompt(session_id)
    if artifact_ctx:
        parts.append(artifact_ctx)

    goal_l = goal.lower()
    want_brief = any(h.lower() in goal_l or h in goal for h in _BRIEF_HINTS)
    want_continue = any(h.lower() in goal_l or h in goal for h in _CONTINUE_HINTS)
    if want_brief or want_continue:
        skill = _load_skill("research-brief")
        if skill:
            parts.append("Active skill (follow closely):\n" + skill)

    parts.append(
        "Workspace: write only under the current session directory. "
        "For long-form research deliverables use mcp__start__publish_report. "
        "When an open drafting report is listed above, continue it with mode=append and its artifact_id."
    )
    parts.append("Current user request:\n" + goal)
    return "\n\n".join(parts)


def run_turn(session_id: str, turn_id: str, goal: str) -> Iterator[str]:
    """SSE generator: drive one dsh run and bridge notifications."""
    global _active_turn_id, _active_session_id, _active_emit_q
    cancel = _cancel_event(turn_id)
    q: queue.Queue[str | None] = queue.Queue()
    error_holder: list[BaseException] = []

    with _active_lock:
        _active_turn_id = turn_id
        _active_session_id = session_id
        _active_emit_q = q

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
    call_args: dict[str, dict[str, Any]] = {}

    def on_notification_tracked(notification: Notification) -> None:
        if cancel.is_set():
            return
        for etype, body in bridge_notification(notification):
            if etype == "assistant_message":
                saw_assistant["ok"] = True
            if etype == "tool_call":
                cid = str(body.get("tool_call_id") or "")
                name = str(body.get("tool") or "")
                args = body.get("arguments") if isinstance(body.get("arguments"), dict) else {}
                if cid and name:
                    call_names[cid] = name
                    call_args[cid] = args
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
                # Register L1 web cards from fetch results (non-blocking).
                try:
                    from start_api.agent.web_artifacts import maybe_register_web_artifact

                    tool_name = str(body.get("tool") or call_names.get(cid) or "")
                    maybe_register_web_artifact(
                        session_id,
                        turn_id,
                        tool_name=tool_name,
                        arguments=call_args.get(cid) or {},
                        result=body.get("result"),
                    )
                except Exception:  # noqa: BLE001
                    pass
            q.put(_emit(session_id, turn_id, etype, body))

    def worker() -> None:
        try:
            with _run_lock:
                if cancel.is_set():
                    return
                harness = _ensure_harness(session_id)
                # Fresh dsh session every KingStar turn; continuity via KingStar history.
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
                _active_emit_q = None
        _clear_cancel(turn_id)
        thread.join(timeout=2.0)
