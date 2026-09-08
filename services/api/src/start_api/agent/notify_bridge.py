"""Map DeepSeek Harness notifications → KingStar agent SSE / session_log events."""

from __future__ import annotations

import json
from typing import Any

from deepseek_harness import Notification


def _assistant_text(data: dict[str, Any]) -> str:
    message = data.get("message")
    owner = message if isinstance(message, dict) else data
    content = owner.get("content")
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text") or ""))
    return "".join(parts)


def _parse_tool_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        val = json.loads(raw)
    except json.JSONDecodeError:
        return {"_raw": raw}
    return val if isinstance(val, dict) else {"value": val}


def _tool_result_payload(data: dict[str, Any]) -> dict[str, Any]:
    message = data.get("message")
    call_id = ""
    content: Any = None
    if isinstance(message, dict):
        call_id = str(
            message.get("callId")
            or message.get("toolCallId")
            or message.get("id")
            or ""
        )
        content = message.get("content")
        if content is None:
            content = message.get("result")
    if not call_id:
        call_id = str(data.get("callId") or data.get("toolCallId") or data.get("id") or "")
    err = data.get("error")
    if err:
        return {
            "tool_call_id": call_id,
            "result": {
                "ok": False,
                "error": err.get("name") if isinstance(err, dict) else str(err),
                "data": content,
            },
        }
    # MCP tools return JSON text; wrap for UI.
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            if isinstance(parsed, dict) and ("ok" in parsed or "error" in parsed):
                return {"tool_call_id": call_id, "result": parsed}
        except json.JSONDecodeError:
            pass
        return {"tool_call_id": call_id, "result": {"ok": True, "data": content[:4000]}}
    if isinstance(content, list):
        texts = [
            str(b.get("text") or "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        ]
        joined = "\n".join(t for t in texts if t)
        if joined:
            try:
                parsed = json.loads(joined)
                if isinstance(parsed, dict) and ("ok" in parsed or "error" in parsed):
                    return {"tool_call_id": call_id, "result": parsed}
            except json.JSONDecodeError:
                pass
            return {"tool_call_id": call_id, "result": {"ok": True, "data": joined[:4000]}}
    return {"tool_call_id": call_id, "result": {"ok": True, "data": content}}


def bridge_notification(notification: Notification) -> list[tuple[str, dict[str, Any]]]:
    """Return zero or more (event_type, payload) pairs for KingStar UI / session_log."""
    method = notification.method
    payload = notification.payload or {}

    if method == "subagent.started":
        child = payload.get("childSessionId") or ""
        return [
            (
                "job_progress",
                {
                    "tool": "subagent",
                    "message": f"子代理启动 · {child}",
                },
            )
        ]
    if method == "subagent.finished":
        child = payload.get("childSessionId") or ""
        return [
            (
                "job_progress",
                {
                    "tool": "subagent",
                    "message": f"子代理结束 · {child}",
                },
            )
        ]

    if method != "session.event":
        return []

    event = payload.get("event")
    if not isinstance(event, dict):
        return []
    etype = event.get("type")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}

    if etype == "assistant/chunk":
        chunk = data.get("chunk")
        if not isinstance(chunk, dict):
            return []
        # Live text deltas → KingStar assistant_delta (not persisted; UI only).
        if chunk.get("type") == "text-delta":
            text = str(chunk.get("text") or "")
            if not text:
                return []
            body: dict[str, Any] = {"content": text}
            step = data.get("step")
            if isinstance(step, int):
                body["step"] = step
            return [("assistant_delta", body)]
        return []

    if etype == "assistant/message":
        text = _assistant_text(data)
        if not text.strip():
            return []
        step = data.get("step")
        body = {"content": text}
        if isinstance(step, int):
            body["step"] = step
        return [("assistant_message", body)]

    if etype == "tool/call":
        name = str(data.get("name") or "")
        args = _parse_tool_args(data.get("arguments"))
        call_id = str(data.get("callId") or "")
        out: list[tuple[str, dict[str, Any]]] = [
            (
                "tool_call",
                {
                    "tool": name,
                    "arguments": args,
                    "tool_call_id": call_id,
                    "step": data.get("step"),
                },
            )
        ]
        # Surface todo updates as job_progress for the dock-friendly timeline
        if "todo" in name.lower():
            todos = args.get("todos") if isinstance(args.get("todos"), list) else None
            if todos is not None:
                done = sum(
                    1
                    for t in todos
                    if isinstance(t, dict) and t.get("status") == "completed"
                )
                out.append(
                    (
                        "job_progress",
                        {
                            "tool": "plan",
                            "message": f"计划 {done}/{len(todos)}",
                        },
                    )
                )
        return out

    if etype == "tool/result":
        body = _tool_result_payload(data)
        # Prefer pairing name from message if present
        message = data.get("message")
        tool_name = ""
        if isinstance(message, dict):
            tool_name = str(message.get("name") or message.get("toolName") or "")
        body["tool"] = tool_name or body.get("tool") or "tool"
        if isinstance(data.get("step"), int):
            body["step"] = data["step"]
        body["ok"] = bool((body.get("result") or {}).get("ok", True))
        return [("tool_result", body)]

    if etype == "user/message":
        # Skip — we already logged the KingStar user_message for this turn
        return []

    if etype in {
        "turn/start",
        "turn/end",
        "step/start",
        "step/end",
        "agent/inbox/spliced",
        "request/header",
        "request/context",
        "assistant/attempt",
    }:
        return []

    # Skip other internal session events to avoid timeline noise
    return []
