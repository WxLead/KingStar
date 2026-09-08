"""HTTP routes for the research assistant (session log + dsh-backed turns)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from start_api.agent import session_log
from start_api.agent.harness_gateway import interrupt_session, request_cancel, run_turn

router = APIRouter(prefix="/api/v1/agent", tags=["agent"])


class CreateSessionBody(BaseModel):
    title: str = Field(default="", max_length=200)


class TurnBody(BaseModel):
    goal: str = Field(..., min_length=1, max_length=8000)


class ConfirmBody(BaseModel):
    confirm_id: str = Field(..., min_length=1, max_length=80)
    approved: bool = True


@router.post("/sessions")
def create_session(body: CreateSessionBody | None = None) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    title = (body.title if body else "") or ""
    return session_log.create_session(title=title)


@router.get("/sessions")
def list_sessions(limit: int = 30) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    return {"items": session_log.list_sessions(limit=limit)}


@router.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    sess = session_log.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session": sess}


@router.get("/sessions/{session_id}/events")
def get_events(session_id: str, after_seq: int = 0, limit: int = 2000) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    if not session_log.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return {"items": session_log.list_events(session_id, after_seq=after_seq, limit=limit)}


@router.post("/sessions/{session_id}/archive")
def archive_session(session_id: str) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    if not session_log.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    session_log.archive_session(session_id)
    return {"ok": True, "session_id": session_id}


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    if not session_log.delete_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return {"ok": True, "session_id": session_id}


@router.post("/sessions/{session_id}/turns")
def start_turn(session_id: str, body: TurnBody) -> StreamingResponse:
    session_log.ensure_agent_tables()
    if not session_log.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    goal = body.goal.strip()
    if not goal:
        raise HTTPException(status_code=400, detail="goal is required")
    turn = session_log.create_turn(session_id, goal)
    turn_id = turn["turn_id"]
    return StreamingResponse(
        run_turn(session_id, turn_id, goal),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-StarT-Agent-Session-Id": session_id,
            "X-StarT-Agent-Turn-Id": turn_id,
        },
    )


@router.post("/sessions/{session_id}/turns/{turn_id}/confirm")
def confirm_turn(session_id: str, turn_id: str, body: ConfirmBody) -> dict[str, Any]:
    """Product confirm gate is unused on the dsh path (P0); kept for API compatibility."""
    session_log.ensure_agent_tables()
    turn = session_log.get_turn(turn_id)
    if not turn or turn.get("session_id") != session_id:
        raise HTTPException(status_code=404, detail="turn not found")
    return {
        "ok": True,
        "approved": body.approved,
        "confirm_id": body.confirm_id,
        "noop": True,
        "message": "dsh path does not wait on product confirm",
    }


@router.post("/sessions/{session_id}/interrupt")
def interrupt_session_route(session_id: str) -> dict[str, Any]:
    """Hard-stop the in-flight dsh turn for this session (kills runtime process)."""
    session_log.ensure_agent_tables()
    if not session_log.get_session(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    return interrupt_session(session_id)


@router.post("/sessions/{session_id}/turns/{turn_id}/cancel")
def cancel_turn(session_id: str, turn_id: str) -> dict[str, Any]:
    session_log.ensure_agent_tables()
    turn = session_log.get_turn(turn_id)
    if turn and turn.get("session_id") != session_id:
        raise HTTPException(status_code=404, detail="turn not found")
    cancelled = request_cancel(turn_id)
    if not cancelled:
        return interrupt_session(session_id)
    if turn and turn.get("status") in {"running", "waiting_confirm"}:
        session_log.update_turn(turn_id, status="cancelled", error="user interrupted")
    return {"ok": True, "turn_id": turn_id, "interrupted": True}
