"""KingStar product BFF — FastAPI."""

from __future__ import annotations

import base64
import json
import os
import shutil
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastmcp.utilities.lifespan import combine_lifespans
from pydantic import BaseModel, Field

TaskStatus = Literal["queued", "parsing", "translating", "done", "failed"]

DATA_DIR = Path(os.getenv("START_DATA_DIR", Path(__file__).resolve().parents[2] / ".data"))
UPLOAD_DIR = DATA_DIR / "uploads"
TASK_DIR = DATA_DIR / "tasks"
MINERU_API_URL = os.getenv("MINERU_API_URL", "http://127.0.0.1:8000")
# Fallback when task uses *-http-client but client omitted server_url
MINERU_VLM_SERVER_URL = os.getenv("MINERU_VLM_SERVER_URL", "http://127.0.0.1:30000")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TASK_DIR.mkdir(parents=True, exist_ok=True)

from start_api import db as library_db  # noqa: E402
from start_api.agent.deps import AgentDeps, configure_agent  # noqa: E402
from start_api.agent.mcp_server import create_mcp_http_app  # noqa: E402
from start_api.agent.router import router as agent_router  # noqa: E402
from start_api.agent import session_log as agent_session_log  # noqa: E402
from start_api.library import configure_library, reindex_upload, run_identify, router as library_router  # noqa: E402

library_db.init_db(DATA_DIR)
agent_session_log.ensure_agent_tables()

_mcp_app = create_mcp_http_app()


@asynccontextmanager
async def _app_lifespan(_app: FastAPI):
    yield
    from start_api.agent import harness_gateway

    harness_gateway.shutdown()


app = FastAPI(
    title="KingStar API",
    version="0.1.0",
    lifespan=combine_lifespans(_app_lifespan, _mcp_app.lifespan),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-KingStar-Agent-Session-Id", "X-KingStar-Agent-Turn-Id"],
)
app.include_router(library_router)
app.include_router(agent_router)
app.mount("/mcp", _mcp_app)

_lock = threading.Lock()
_tasks: dict[str, dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _task_path(task_id: str) -> Path:
    return TASK_DIR / task_id


def _save_task_images(work: Path, images: dict[str, str]) -> int:
    """Persist MinerU images dict (filename -> data-URL or filesystem path) under work/images/."""
    if not images:
        return 0
    img_dir = work / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    saved = 0
    for name, data in images.items():
        safe = Path(str(name).replace("\\", "/")).name
        if not safe or safe in {".", ".."}:
            continue
        dest = img_dir / safe
        try:
            if isinstance(data, str) and data.startswith("data:") and "," in data:
                _header, b64 = data.split(",", 1)
                dest.write_bytes(base64.b64decode(b64))
                saved += 1
            else:
                src = Path(str(data))
                if src.is_file():
                    shutil.copyfile(src, dest)
                    saved += 1
        except Exception:
            continue
    return saved


def _upload_dir(upload_id: str) -> Path:
    return UPLOAD_DIR / upload_id


def _upload_meta_path(upload_id: str) -> Path:
    return _upload_dir(upload_id) / "meta.json"


def _save_upload_meta(meta: dict[str, Any]) -> None:
    path = _upload_meta_path(meta["upload_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_upload_meta(upload_id: str) -> dict[str, Any] | None:
    path = _upload_meta_path(upload_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _resolve_upload_file(upload_id: str) -> Path | None:
    folder = _upload_dir(upload_id)
    if not folder.exists():
        return None
    for p in folder.iterdir():
        if p.is_file() and p.name != "meta.json":
            return p
    return None


def _task_has_zh(task_id: str | None) -> bool:
    if not task_id:
        return False
    return (_task_path(task_id) / "document_zh.md").is_file()


def _pipeline_stage(meta: dict[str, Any]) -> str:
    """unprocessed | parsing | translating | parsed | completed | failed"""
    status = meta.get("last_status")
    tid = meta.get("last_task_id")
    has_zh = meta.get("has_zh")
    if has_zh is None:
        has_zh = _task_has_zh(tid)
    if status in {"queued", "parsing"}:
        return "parsing"
    if status == "translating":
        return "translating"
    if status == "done":
        return "completed" if has_zh else "parsed"
    if status == "failed":
        # Keep usable parse/translate artifacts visible in the sidebar
        if tid and (_task_path(tid) / "document.md").is_file():
            return "completed" if has_zh else "parsed"
        return "failed"
    return "unprocessed"


def _enrich_upload_meta(meta: dict[str, Any]) -> dict[str, Any]:
    out = dict(meta)
    tid = out.get("last_task_id")
    if out.get("has_zh") is None:
        out["has_zh"] = _task_has_zh(tid)
    out["pipeline_stage"] = _pipeline_stage(out)
    return out


def _merge_library_fields(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields = library_db.library_fields_for([i["upload_id"] for i in items if i.get("upload_id")])
    for item in items:
        extra = fields.get(item["upload_id"], {})
        for key, val in extra.items():
            item[key] = val
    return items


def _search_corpus_for(upload_id: str) -> tuple[str, str, str]:
    """filename, md_en, md_zh for FTS indexing."""
    meta = _load_upload_meta(upload_id) or {}
    filename = str(meta.get("filename") or "")
    tid = meta.get("last_task_id")
    md_en, md_zh = "", ""
    if tid:
        en_path = _task_path(str(tid)) / "document.md"
        zh_path = _task_path(str(tid)) / "document_zh.md"
        if en_path.is_file():
            try:
                md_en = en_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                pass
        if zh_path.is_file():
            try:
                md_zh = zh_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                pass
    return filename, md_en, md_zh


def _list_upload_metas_raw() -> list[dict[str, Any]]:
    """Filesystem upload metas without library merge (avoids recursion)."""
    items: list[dict[str, Any]] = []
    if not UPLOAD_DIR.exists():
        return items
    for folder in UPLOAD_DIR.iterdir():
        if not folder.is_dir():
            continue
        meta = _load_upload_meta(folder.name)
        if meta:
            items.append(_enrich_upload_meta(meta))
            continue
        files = [p for p in folder.iterdir() if p.is_file() and p.name != "meta.json"]
        if not files:
            continue
        f = files[0]
        meta = {
            "upload_id": folder.name,
            "filename": f.name,
            "size": f.stat().st_size,
            "content_type": None,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
            "last_task_id": None,
            "last_status": None,
            "has_zh": False,
        }
        _save_upload_meta(meta)
        items.append(_enrich_upload_meta(meta))
    items.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return items


def _list_upload_metas() -> list[dict[str, Any]]:
    return _merge_library_fields(_list_upload_metas_raw())


configure_library(
    resolve_search_corpus=_search_corpus_for,
    list_upload_ids=lambda: [m["upload_id"] for m in _list_upload_metas_raw()],
)


def _save_task(task: dict[str, Any]) -> None:
    tid = task["task_id"]
    path = _task_path(tid)
    path.mkdir(parents=True, exist_ok=True)
    (path / "meta.json").write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
    with _lock:
        _tasks[tid] = task

    upload_id = task.get("upload_id")
    if upload_id:
        umeta = _load_upload_meta(upload_id)
        if umeta:
            umeta["last_task_id"] = tid
            umeta["last_status"] = task.get("status")
            status = task.get("status")
            if status == "done":
                umeta["has_zh"] = _task_has_zh(tid)
            elif status in {"queued", "parsing"}:
                # New layout analysis supersedes previous translation
                umeta["has_zh"] = False
            umeta["updated_at"] = _now()
            _save_upload_meta(umeta)
            if status == "done":
                try:
                    reindex_upload(str(upload_id))
                except Exception:
                    pass
                # Auto bibliographic identify once markdown exists
                md_path = _task_path(str(tid)) / "document.md"
                if md_path.is_file():
                    uid = str(upload_id)

                    def _bg_identify(u: str = uid) -> None:
                        try:
                            run_identify(u, force=False)
                        except Exception as exc:  # noqa: BLE001
                            print(f"[identify] upload={u} failed: {exc}")

                    threading.Thread(target=_bg_identify, daemon=True).start()


def _load_all_tasks() -> None:
    if not TASK_DIR.exists():
        return
    for meta in TASK_DIR.glob("*/meta.json"):
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            _tasks[data["task_id"]] = data
        except Exception:
            continue


def _friendly_task_error(err: BaseException) -> str:
    """Map common failures to short Chinese messages for the UI."""
    msg = (str(err) or "").strip() or err.__class__.__name__
    low = msg.lower()
    if any(k in low for k in ("10061", "connection refused", "connecterror", "connect error", "name or service not known")):
        return "无法连接解析服务，请确认 MinerU 已启动（默认 :8000）。"
    if any(k in low for k in ("api key", "unauthorized", "401", "authentication", "invalid_api_key")):
        return "AI API Key 无效或未配置，请到「通用设置 → AI API」检查。"
    if "timeout" in low or "timed out" in low:
        return "请求超时，请稍后重试或检查网络与服务负载。"
    if "cuda" in low or "out of memory" in low or "oom" in low:
        return "显存不足或 GPU 异常，可关闭公式/表格解析后重试。"
    if len(msg) > 240:
        return msg[:240] + "…"
    return msg


def _reclaim_interrupted_tasks() -> None:
    """After BFF restart, in-flight jobs have no worker — mark failed so UI can retry."""
    for task in list(_tasks.values()):
        st = task.get("status")
        if st not in {"queued", "parsing", "translating"}:
            continue
        task["status"] = "failed"
        task["error"] = "服务重启，任务已中断。请在任务管理中点击「重试」。"
        task["progress"] = {
            "ratio": 0.0,
            "message": "已中断",
            "done": None,
            "total": None,
        }
        task["updated_at"] = _now()
        _save_task(task)


_load_all_tasks()
_reclaim_interrupted_tasks()


class CreateTaskRequest(BaseModel):
    upload_id: str
    translate: bool = False
    beautify: bool = False
    parse_backend: str = Field(default="hybrid-engine")
    server_url: str | None = None


class UploadResponse(BaseModel):
    upload_id: str
    filename: str
    size: int
    content_type: str | None = None
    created_at: str | None = None


class TaskCreateResponse(BaseModel):
    task_id: str
    status: TaskStatus


def _run_task(task_id: str) -> None:
    task = _tasks.get(task_id)
    if not task:
        return
    work = _task_path(task_id)
    upload_path = Path(task["upload_path"])
    backend = task.get("parse_backend") or "hybrid-engine"
    server_url = task.get("server_url")
    if not server_url and "http-client" in str(backend):
        server_url = MINERU_VLM_SERVER_URL

    try:
        task["status"] = "parsing"
        task["error"] = None
        task["updated_at"] = _now()
        _set_task_progress(task, ratio=0.08, message="MinerU 版面分析中…")

        md_path = work / "document.md"
        suffix = upload_path.suffix.lower()
        if suffix in {".md", ".markdown", ".txt"}:
            text = upload_path.read_text(encoding="utf-8", errors="ignore")
            md_path.write_text(text, encoding="utf-8")
            task["result"] = {
                "markdown_url": f"/api/v1/tasks/{task_id}/artifacts/markdown",
                "meta": {"backend": "passthrough", "source": "upload", "pages": None},
            }
        else:
            from start_parse import MinerUClient

            client = MinerUClient(MINERU_API_URL)
            result = client.parse_file(
                upload_path,
                backend=backend,
                server_url=server_url,
                return_images=True,
            )
            md_path.write_text(result.markdown or "", encoding="utf-8")
            if result.middle_json is not None:
                (work / "middle.json").write_text(
                    json.dumps(result.middle_json, ensure_ascii=False), encoding="utf-8"
                )
            if result.content_list is not None:
                (work / "content_list.json").write_text(
                    json.dumps(result.content_list, ensure_ascii=False), encoding="utf-8"
                )
            _save_task_images(work, result.images or {})
            task["result"] = {
                "markdown_url": f"/api/v1/tasks/{task_id}/artifacts/markdown",
                "middle_json_url": f"/api/v1/tasks/{task_id}/artifacts/middle_json",
                "content_list_url": f"/api/v1/tasks/{task_id}/artifacts/content_list",
                "images_url": f"/api/v1/tasks/{task_id}/images",
                "meta": result.meta,
            }

        if task.get("translate"):
            _translate_task_markdown(task_id, task, beautify=bool(task.get("beautify")))
        else:
            # Parse-only: drop stale translation so upload stage becomes "parsed"
            for stale in (
                work / "document_zh.md",
                work / "document_zh.pdf",
                work / "document_zh_beautify.pdf",
                work / "document_zh_beautify.html",
                work / "content_list_zh.json",
            ):
                if stale.is_file():
                    stale.unlink()

        task["status"] = "done"
        task["updated_at"] = _now()
        task["error"] = None
        task["progress"] = {"ratio": 1.0, "message": "完成", "done": None, "total": None}
        _save_task(task)
    except Exception as err:  # noqa: BLE001
        task["status"] = "failed"
        task["error"] = _friendly_task_error(err)
        task["progress"] = {
            "ratio": float((task.get("progress") or {}).get("ratio") or 0),
            "message": "失败",
            "done": None,
            "total": None,
        }
        task["updated_at"] = _now()
        _save_task(task)


def _load_task(task_id: str) -> dict[str, Any] | None:
    task = _tasks.get(task_id)
    if task:
        return task
    meta = _task_path(task_id) / "meta.json"
    if not meta.exists():
        return None
    task = json.loads(meta.read_text(encoding="utf-8"))
    with _lock:
        _tasks[task_id] = task
    return task


def _set_task_progress(
    task: dict[str, Any],
    *,
    ratio: float,
    message: str,
    done: int | None = None,
    total: int | None = None,
) -> None:
    """Persist lightweight progress for UI polling (0–1 ratio)."""
    task["progress"] = {
        "ratio": max(0.0, min(1.0, float(ratio))),
        "message": message,
        "done": done,
        "total": total,
    }
    task["updated_at"] = _now()
    _save_task(task)


def _translate_content_list(
    work: Path,
    *,
    doc_stem: str,
    on_progress: Any | None = None,
) -> Path | None:
    """Translate content_list.json text fields → content_list_zh.json (keeps bbox).

    Enables ZH markdown segments to share the same box linkage as English.
    Uses Translator.translate_chunk so full-document translation cache is reused.
    """
    src = work / "content_list.json"
    if not src.is_file():
        return None

    from concurrent.futures import ThreadPoolExecutor, as_completed

    from start_translate.config import load_config, translate_cache_dir
    from start_translate.translate_md import (
        Translator,
        build_client_config,
        load_glossary,
        localize_references_heading,
        needs_translation,
    )

    items: list[Any] = json.loads(src.read_text(encoding="utf-8"))
    if not isinstance(items, list) or not items:
        return None

    cfg = load_config()
    api_key, base_url, model = build_client_config()
    translator = Translator(
        api_key=api_key,
        base_url=base_url,
        model=model,
        cache_dir=translate_cache_dir(),
        glossary_hint=load_glossary(None),
        doc_stem=doc_stem,
    )
    concurrency = max(1, int(cfg["translate"].get("concurrency") or 3))

    def translate_text(text: str) -> str:
        if not text or not str(text).strip():
            return text
        localized = localize_references_heading(text)
        if localized is not None:
            return localized
        if not needs_translation(text):
            return text
        try:
            return translator.translate_chunk(text)
        except Exception:  # noqa: BLE001
            return text

    def translate_item(item: Any) -> Any:
        if not isinstance(item, dict):
            return item
        out = dict(item)
        if isinstance(out.get("text"), str):
            out["text"] = translate_text(out["text"])
        for key in ("image_caption", "image_footnote", "table_caption", "table_footnote"):
            vals = out.get(key)
            if isinstance(vals, list):
                out[key] = [translate_text(v) if isinstance(v, str) else v for v in vals]
        if isinstance(out.get("table_body"), str) and out["table_body"].strip():
            out["table_body"] = translate_text(out["table_body"])
        return out

    # Preserve order; translate items concurrently
    results: list[Any | None] = [None] * len(items)
    total = len(items)
    done = 0
    if on_progress:
        on_progress(0, total)
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(translate_item, item): i for i, item in enumerate(items)}
        for fut in as_completed(futures):
            i = futures[fut]
            results[i] = fut.result()
            done += 1
            if on_progress:
                on_progress(done, total)

    out_path = work / "content_list_zh.json"
    out_path.write_text(
        json.dumps(results, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return out_path


def _translate_task_markdown(task_id: str, task: dict[str, Any], *, beautify: bool = False) -> None:
    """Translate existing document.md in-place; does not re-run MinerU."""
    work = _task_path(task_id)
    md_path = work / "document.md"
    if not md_path.is_file():
        raise FileNotFoundError("document.md missing; run layout analysis first")

    task["status"] = "translating"
    task["translate"] = True
    task["updated_at"] = _now()
    _set_task_progress(task, ratio=0.02, message="准备翻译…")

    from start_translate.api import beautify_and_export, export_pdf, translate_markdown

    zh_path = work / "document_zh.md"
    pdf_path = work / ("document_zh_beautify.pdf" if beautify else "document_zh.pdf")

    def on_md_progress(done: int, total: int) -> None:
        # Markdown chunks occupy ~8% → 72%
        t = max(total, 1)
        ratio = 0.08 + 0.64 * (done / t)
        _set_task_progress(
            task,
            ratio=ratio,
            message=f"翻译正文 {done}/{total}",
            done=done,
            total=total,
        )

    translate_markdown(
        md_path,
        zh_path,
        doc_stem=task_id,
        force=True,
        on_progress=on_md_progress,
    )
    _set_task_progress(task, ratio=0.74, message="生成译文联动段落…")

    def on_cl_progress(done: int, total: int) -> None:
        t = max(total, 1)
        ratio = 0.74 + 0.18 * (done / t)
        _set_task_progress(
            task,
            ratio=ratio,
            message=f"联动段落 {done}/{total}",
            done=done,
            total=total,
        )

    _translate_content_list(work, doc_stem=task_id, on_progress=on_cl_progress)
    # PDF is best-effort — MD translation success must not be marked failed if export breaks
    _set_task_progress(task, ratio=0.94, message="导出 PDF…")
    try:
        if beautify:
            html_path = work / "document_zh_beautify.html"
            beautify_and_export(zh_path, pdf_path, html_path, doc_stem=task_id)
        else:
            export_pdf(zh_path, pdf_path, doc_stem=task_id)
    except Exception as pdf_err:  # noqa: BLE001
        # Leave zh markdown usable; export can be retried from the UI
        result = task.get("result") if isinstance(task.get("result"), dict) else {}
        result["pdf_error"] = str(pdf_err)
        task["result"] = result

    result = task.get("result") if isinstance(task.get("result"), dict) else {}
    result["markdown_url"] = result.get("markdown_url") or f"/api/v1/tasks/{task_id}/artifacts/markdown"
    result["zh_markdown_url"] = f"/api/v1/tasks/{task_id}/artifacts/zh_markdown"
    if pdf_path.is_file():
        result["pdf_url"] = f"/api/v1/tasks/{task_id}/artifacts/pdf"
    if (work / "content_list_zh.json").is_file():
        result["content_list_zh_url"] = f"/api/v1/tasks/{task_id}/artifacts/content_list_zh"
    task["result"] = result
    _set_task_progress(task, ratio=1.0, message="完成")

def _run_translate_only(task_id: str, *, beautify: bool = False) -> None:
    task = _load_task(task_id)
    if not task:
        return
    try:
        _translate_task_markdown(task_id, task, beautify=beautify)
        task["status"] = "done"
        task["updated_at"] = _now()
        task["error"] = None
        task["progress"] = {"ratio": 1.0, "message": "完成"}
        _save_task(task)
    except Exception as err:  # noqa: BLE001
        task["status"] = "failed"
        task["error"] = _friendly_task_error(err)
        task["updated_at"] = _now()
        _save_task(task)


def _run_link_zh_only(task_id: str) -> None:
    """Backfill content_list_zh.json for an already-translated task."""
    task = _load_task(task_id)
    if not task:
        return
    work = _task_path(task_id)
    try:
        task["status"] = "translating"
        task["updated_at"] = _now()
        task["error"] = None
        _save_task(task)

        out = _translate_content_list(work, doc_stem=task_id)
        if out is None:
            raise FileNotFoundError("content_list.json missing; cannot build ZH link segments")

        result = task.get("result") if isinstance(task.get("result"), dict) else {}
        result["content_list_zh_url"] = f"/api/v1/tasks/{task_id}/artifacts/content_list_zh"
        task["result"] = result
        task["status"] = "done"
        task["updated_at"] = _now()
        task["error"] = None
        _save_task(task)
    except Exception as err:  # noqa: BLE001
        task["status"] = "failed"
        task["error"] = _friendly_task_error(err)
        task["updated_at"] = _now()
        _save_task(task)


@app.get("/api/v1/health")
def health() -> dict[str, Any]:
    mineru = "unknown"
    try:
        from start_parse import MinerUClient

        MinerUClient(MINERU_API_URL).health()
        mineru = "up"
    except Exception:
        mineru = "down"
    translate = "ready"
    try:
        import start_translate  # noqa: F401
    except Exception:
        translate = "missing"

    llm = "unset"
    try:
        from start_api.llm_config import load_llm_config

        api_key, base_url, model = load_llm_config()
        if api_key and base_url:
            llm = "configured"
        elif base_url and model:
            llm = "unset"
    except Exception:
        llm = "unknown"

    return {
        "ok": True,
        "mineru": mineru,
        "translate": translate,
        "llm": llm,
        "data_dir": str(DATA_DIR.resolve()),
    }


@app.post("/api/v1/uploads", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    upload_id = str(uuid.uuid4())
    dest_dir = _upload_dir(upload_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "upload.bin"
    dest = dest_dir / filename
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    size = dest.stat().st_size
    created = _now()
    meta = {
        "upload_id": upload_id,
        "filename": filename,
        "size": size,
        "content_type": file.content_type,
        "created_at": created,
        "last_task_id": None,
        "last_status": None,
        "has_zh": False,
    }
    _save_upload_meta(meta)
    return UploadResponse(
        upload_id=upload_id,
        filename=filename,
        size=size,
        content_type=file.content_type,
        created_at=created,
    )


class UploadFromUrlRequest(BaseModel):
    url: str = Field(..., min_length=3, max_length=2000)


@app.post("/api/v1/uploads/from-url", response_model=UploadResponse)
def upload_from_url(body: UploadFromUrlRequest) -> UploadResponse:
    """Download a PDF from arXiv / DOI / direct URL and register as an upload."""
    from start_api.url_import import download_pdf, enrich_metadata, resolve_source

    try:
        source = resolve_source(body.url)
        data, filename, content_type = download_pdf(
            source.download_url, suggested_name=source.filename
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    upload_id = str(uuid.uuid4())
    dest_dir = _upload_dir(upload_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    dest.write_bytes(data)
    size = dest.stat().st_size
    created = _now()
    meta = {
        "upload_id": upload_id,
        "filename": filename,
        "size": size,
        "content_type": content_type,
        "created_at": created,
        "last_task_id": None,
        "last_status": None,
        "has_zh": False,
        "source_url": body.url.strip(),
        "download_url": source.download_url,
    }
    _save_upload_meta(meta)

    try:
        patch = enrich_metadata(source.arxiv_id, source.doi)
        if patch:
            patch["metadata_identified_at"] = created
            library_db.upsert_paper(upload_id, patch)
    except Exception:
        pass

    return UploadResponse(
        upload_id=upload_id,
        filename=filename,
        size=size,
        content_type=content_type,
        created_at=created,
    )


@app.get("/api/v1/uploads")
def list_uploads() -> dict[str, Any]:
    return {"items": _list_upload_metas()}


@app.delete("/api/v1/uploads/{upload_id}")
def delete_upload(upload_id: str) -> dict[str, Any]:
    folder = _upload_dir(upload_id)
    if not folder.exists():
        raise HTTPException(status_code=404, detail="upload not found")

    # Cascade: remove parse/translate artifacts bound to this upload
    removed_tasks: list[str] = []
    with _lock:
        bound = [
            tid
            for tid, t in list(_tasks.items())
            if t.get("upload_id") == upload_id
        ]
        for tid in bound:
            _tasks.pop(tid, None)
            task_dir = _task_path(tid)
            if task_dir.exists():
                shutil.rmtree(task_dir, ignore_errors=True)
            removed_tasks.append(tid)

    # Also sweep disk tasks not in memory (e.g. after API restart)
    if TASK_DIR.exists():
        for meta_path in TASK_DIR.glob("*/meta.json"):
            try:
                data = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception:
                continue
            if data.get("upload_id") != upload_id:
                continue
            tid = str(data.get("task_id") or meta_path.parent.name)
            if tid in removed_tasks:
                continue
            with _lock:
                _tasks.pop(tid, None)
            shutil.rmtree(meta_path.parent, ignore_errors=True)
            removed_tasks.append(tid)

    shutil.rmtree(folder)
    try:
        library_db.delete_paper_data(upload_id)
    except Exception:
        pass
    return {"ok": True, "upload_id": upload_id, "removed_tasks": removed_tasks}


@app.get("/api/v1/uploads/{upload_id}/file")
def get_upload_file(upload_id: str) -> FileResponse:
    """Serve original uploaded bytes for in-app preview."""
    path = _resolve_upload_file(upload_id)
    if path is None:
        raise HTTPException(status_code=404, detail="upload not found")
    meta = _load_upload_meta(upload_id) or {}
    media = meta.get("content_type") or "application/octet-stream"
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt", ".markdown"}:
        media = "text/plain; charset=utf-8"
    elif suffix == ".pdf":
        media = "application/pdf"
    elif suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        media = f"image/{'jpeg' if suffix in {'.jpg', '.jpeg'} else suffix[1:]}"
    return FileResponse(path, media_type=media, filename=path.name)


@app.post("/api/v1/tasks", response_model=TaskCreateResponse)
def create_task(body: CreateTaskRequest, background: BackgroundTasks) -> TaskCreateResponse:
    upload_path = _resolve_upload_file(body.upload_id)
    if upload_path is None:
        raise HTTPException(status_code=404, detail="upload_id not found")

    task_id = str(uuid.uuid4())
    now = _now()
    task: dict[str, Any] = {
        "task_id": task_id,
        "filename": upload_path.name,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "error": None,
        "upload_id": body.upload_id,
        "upload_path": str(upload_path),
        "translate": body.translate,
        "beautify": body.beautify,
        "parse_backend": body.parse_backend,
        "server_url": body.server_url,
        "result": None,
    }
    _save_task(task)
    background.add_task(_run_task, task_id)
    return TaskCreateResponse(task_id=task_id, status="queued")


@app.get("/api/v1/tasks")
def list_tasks() -> dict[str, Any]:
    items = sorted(_tasks.values(), key=lambda t: t.get("created_at", ""), reverse=True)
    return {
        "items": [
            {
                "task_id": t["task_id"],
                "filename": t["filename"],
                "status": t["status"],
                "created_at": t["created_at"],
                "updated_at": t["updated_at"],
                "error": t.get("error"),
                "upload_id": t.get("upload_id"),
                "translate": t.get("translate"),
            }
            for t in items
        ]
    }


@app.get("/api/v1/tasks/{task_id}")
def get_task(task_id: str) -> dict[str, Any]:
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return {
        "task_id": task["task_id"],
        "filename": task["filename"],
        "status": task["status"],
        "created_at": task["created_at"],
        "updated_at": task["updated_at"],
        "error": task.get("error"),
        "result": task.get("result"),
        "upload_id": task.get("upload_id"),
        "translate": task.get("translate"),
        "progress": task.get("progress"),
    }


class TranslateTaskRequest(BaseModel):
    beautify: bool = False


class ExportPdfRequest(BaseModel):
    """Export Markdown via translate `export_pdf` (same as CLI `direct` PDF step)."""

    source: str = Field(default="en", description="en = document.md, zh = document_zh.md")


class LayoutSaveRequest(BaseModel):
    """Persist manual layout corrections (Plan A)."""

    middle: dict[str, Any]
    content_list: list[Any]


def _img_names_from_content_list(content_list: list[Any]) -> set[str]:
    names: set[str] = set()
    for item in content_list:
        if not isinstance(item, dict):
            continue
        path = str(item.get("img_path") or "").replace("\\", "/").strip()
        if not path:
            continue
        name = Path(path).name
        if name and name not in {".", ".."}:
            names.add(name)
    return names


@app.put("/api/v1/tasks/{task_id}/layout")
def save_task_layout(task_id: str, body: LayoutSaveRequest) -> dict[str, Any]:
    """Save edited middle.json + content_list.json and rebuild document.md."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    work = _task_path(task_id)
    if not (work / "middle.json").is_file() and not (work / "content_list.json").is_file():
        raise HTTPException(status_code=400, detail="no layout artifacts to edit")

    from start_api.layout_rebuild import rebuild_markdown_from_content_list

    middle_path = work / "middle.json"
    cl_path = work / "content_list.json"
    md_path = work / "document.md"

    old_names: set[str] = set()
    if cl_path.is_file():
        try:
            old_cl = json.loads(cl_path.read_text(encoding="utf-8"))
            if isinstance(old_cl, list):
                old_names = _img_names_from_content_list(old_cl)
        except Exception:
            old_names = set()

    middle_path.write_text(
        json.dumps(body.middle, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    cl_path.write_text(
        json.dumps(body.content_list, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    md_path.write_text(
        rebuild_markdown_from_content_list(body.content_list),
        encoding="utf-8",
    )

    # Drop image files no longer referenced by content_list
    new_names = _img_names_from_content_list(
        body.content_list if isinstance(body.content_list, list) else []
    )
    img_dir = work / "images"
    if img_dir.is_dir():
        for name in old_names - new_names:
            try:
                p = img_dir / name
                if p.is_file():
                    p.unlink()
            except Exception:
                pass

    # Stale ZH link segments / translation no longer match English layout
    for stale in (work / "content_list_zh.json",):
        if stale.is_file():
            stale.unlink()

    result = task.get("result") if isinstance(task.get("result"), dict) else {}
    result["markdown_url"] = f"/api/v1/tasks/{task_id}/artifacts/markdown"
    result["middle_json_url"] = f"/api/v1/tasks/{task_id}/artifacts/middle_json"
    result["content_list_url"] = f"/api/v1/tasks/{task_id}/artifacts/content_list"
    result.pop("content_list_zh_url", None)
    task["result"] = result
    task["updated_at"] = _now()
    _save_task(task)

    return {
        "ok": True,
        "task_id": task_id,
        "zh_stale": (work / "document_zh.md").is_file(),
    }


@app.post("/api/v1/tasks/{task_id}/images")
async def upload_task_image(
    task_id: str,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload a cropped figure (e.g. from image_body edit) into the task images/ folder."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    raw_name = Path(file.filename or "crop.png").name
    suf = Path(raw_name).suffix.lower()
    if suf not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        suf = ".png"
    safe = f"edit_{uuid.uuid4().hex[:12]}{suf}"
    img_dir = _task_path(task_id) / "images"
    img_dir.mkdir(parents=True, exist_ok=True)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty image")
    if len(data) > 40 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="image too large")
    (img_dir / safe).write_bytes(data)
    return {
        "filename": safe,
        "img_path": f"images/{safe}",
        "url": f"/api/v1/tasks/{task_id}/images/{safe}",
    }


@app.post("/api/v1/tasks/{task_id}/retry", response_model=TaskCreateResponse)
def retry_task(task_id: str, background: BackgroundTasks) -> TaskCreateResponse:
    """Re-queue a failed/done task with the same parse/translate options."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    upload_path = Path(task.get("upload_path") or "")
    if not upload_path.is_file():
        raise HTTPException(status_code=400, detail="原始上传文件已丢失，无法重试")

    task["status"] = "queued"
    task["error"] = None
    task["progress"] = {
        "ratio": 0.0,
        "message": "排队重试…",
        "done": None,
        "total": None,
    }
    task["updated_at"] = _now()
    _save_task(task)
    background.add_task(_run_task, task_id)
    return TaskCreateResponse(task_id=task_id, status="queued")


@app.post("/api/v1/tasks/{task_id}/translate", response_model=TaskCreateResponse)
def translate_existing_task(
    task_id: str,
    background: BackgroundTasks,
    body: TranslateTaskRequest | None = None,
) -> TaskCreateResponse:
    """Translate an already-parsed task's document.md — skips MinerU layout analysis."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    md_path = _task_path(task_id) / "document.md"
    if not md_path.is_file():
        raise HTTPException(
            status_code=400,
            detail="document.md not found; finish layout analysis before translating",
        )
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    beautify = bool(body.beautify) if body else False
    task["status"] = "translating"
    task["translate"] = True
    task["beautify"] = beautify
    task["updated_at"] = _now()
    task["error"] = None
    _save_task(task)
    background.add_task(_run_translate_only, task_id, beautify=beautify)
    return TaskCreateResponse(task_id=task_id, status="translating")


@app.post("/api/v1/tasks/{task_id}/link-zh", response_model=TaskCreateResponse)
def link_zh_segments(task_id: str, background: BackgroundTasks) -> TaskCreateResponse:
    """Backfill content_list_zh.json so ZH view can hover-link like EN."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    work = _task_path(task_id)
    if not (work / "content_list.json").is_file():
        raise HTTPException(status_code=400, detail="content_list.json not found")
    if not (work / "document_zh.md").is_file():
        raise HTTPException(status_code=400, detail="译文不存在，请先完成翻译")
    if (work / "content_list_zh.json").is_file():
        return TaskCreateResponse(task_id=task_id, status="done")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    task["status"] = "translating"
    task["updated_at"] = _now()
    task["error"] = None
    _save_task(task)
    background.add_task(_run_link_zh_only, task_id)
    return TaskCreateResponse(task_id=task_id, status="translating")


@app.post("/api/v1/tasks/{task_id}/export/pdf")
def export_task_pdf(task_id: str, body: ExportPdfRequest | None = None) -> FileResponse:
    """Export task Markdown to PDF using start_translate.export_pdf (direct pipeline)."""
    task = _load_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise HTTPException(status_code=409, detail=f"task is busy ({task.get('status')})")

    source = (body.source if body else "en").strip().lower()
    if source not in {"en", "zh"}:
        raise HTTPException(status_code=400, detail="source must be 'en' or 'zh'")

    work = _task_path(task_id)
    if source == "zh":
        md_path = work / "document_zh.md"
        pdf_path = work / "document_zh.pdf"
        download_name = "document_zh.pdf"
        if not md_path.is_file():
            raise HTTPException(status_code=400, detail="译文不存在，请先完成翻译")
    else:
        md_path = work / "document.md"
        pdf_path = work / "document_en.pdf"
        download_name = "document_en.pdf"
        if not md_path.is_file():
            raise HTTPException(status_code=400, detail="document.md not found")

    try:
        from start_translate.api import export_pdf

        export_pdf(md_path, pdf_path, doc_stem=f"{task_id}_{source}")
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"PDF 导出失败: {err}") from err

    if not pdf_path.is_file():
        raise HTTPException(status_code=500, detail="PDF 未生成")

    result = task.get("result") if isinstance(task.get("result"), dict) else {}
    result["pdf_url"] = f"/api/v1/tasks/{task_id}/artifacts/pdf"
    if source == "en":
        result["en_pdf_url"] = f"/api/v1/tasks/{task_id}/artifacts/en_pdf"
    task["result"] = result
    task["updated_at"] = _now()
    _save_task(task)

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=download_name,
    )


@app.get("/api/v1/tasks/{task_id}/artifacts/{name}")
def get_artifact(task_id: str, name: str) -> FileResponse:
    work = _task_path(task_id)
    mapping = {
        "markdown": work / "document.md",
        "zh_markdown": work / "document_zh.md",
        "pdf": work / "document_zh_beautify.pdf"
        if (work / "document_zh_beautify.pdf").exists()
        else work / "document_zh.pdf",
        "en_pdf": work / "document_en.pdf",
        "middle_json": work / "middle.json",
        "content_list": work / "content_list.json",
        "content_list_zh": work / "content_list_zh.json",
    }
    path = mapping.get(name)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail=f"artifact {name} not found")
    media = "application/pdf" if path.suffix == ".pdf" else "application/octet-stream"
    if path.suffix in {".md", ".txt"}:
        media = "text/markdown; charset=utf-8"
    if path.suffix == ".json":
        media = "application/json"
    return FileResponse(path, media_type=media, filename=path.name)


@app.get("/api/v1/tasks/{task_id}/images/{filename}")
def get_task_image(task_id: str, filename: str) -> FileResponse:
    """Serve a cropped figure saved under the task's images/ folder."""
    safe = Path(filename).name
    if not safe or safe != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="invalid filename")
    path = _task_path(task_id) / "images" / safe
    if not path.is_file():
        raise HTTPException(status_code=404, detail="image not found")
    media = "image/jpeg"
    suf = path.suffix.lower()
    if suf == ".png":
        media = "image/png"
    elif suf == ".webp":
        media = "image/webp"
    elif suf == ".gif":
        media = "image/gif"
    elif suf in {".jpg", ".jpeg"}:
        media = "image/jpeg"
    return FileResponse(path, media_type=media, filename=safe)


from start_api.reading_chat import (
    ReadingChatRequest,
    ReadingChatResponse,
    chat_with_deepseek,
    load_deepseek_config,
    stream_chat_with_deepseek,
)
from start_api.llm_config import (
    LlmModelsQuery,
    LlmModelsResult,
    LlmSettingsPublic,
    LlmSettingsUpdate,
    list_remote_models,
    public_llm_settings,
    save_llm_settings,
)


@app.get("/api/v1/settings/llm", response_model=LlmSettingsPublic)
def get_llm_settings() -> LlmSettingsPublic:
    """OpenAI-compatible API settings (key masked)."""
    return public_llm_settings()


@app.put("/api/v1/settings/llm", response_model=LlmSettingsPublic)
def put_llm_settings(body: LlmSettingsUpdate) -> LlmSettingsPublic:
    """Save API key / base URL / model for translation + reading AI."""
    try:
        return save_llm_settings(body)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"无法写入设置文件: {exc}") from exc


@app.post("/api/v1/settings/llm/models", response_model=LlmModelsResult)
def probe_llm_models(body: LlmModelsQuery) -> LlmModelsResult:
    """List models from the provider via OpenAI-compatible GET /models."""
    return list_remote_models(api_key=body.api_key, base_url=body.base_url)


@app.post("/api/v1/reading/chat")
def reading_chat(body: ReadingChatRequest) -> StreamingResponse:
    """Reading-room Q&A — SSE stream (`text/event-stream`)."""
    api_key, _, _ = load_deepseek_config()
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="未配置 AI API Key。请在「通用设置 → AI API」中填写后重试。",
        )

    return StreamingResponse(
        stream_chat_with_deepseek(body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/reading/chat/sync", response_model=ReadingChatResponse)
def reading_chat_sync(body: ReadingChatRequest) -> ReadingChatResponse:
    """Non-streaming fallback for the same payload."""
    try:
        return chat_with_deepseek(body)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI 调用失败: {exc}") from exc


# ---------------------------------------------------------------------------
# Agent domain ops (shared by literature tools via configure_agent)
# ---------------------------------------------------------------------------


def _agent_get_upload(upload_id: str) -> dict[str, Any] | None:
    meta = _load_upload_meta(upload_id)
    if not meta:
        return None
    items = _merge_library_fields([_enrich_upload_meta(dict(meta))])
    return items[0] if items else None


def _agent_upload_from_url(url: str) -> dict[str, Any]:
    from start_api.url_import import download_pdf, enrich_metadata, resolve_source

    source = resolve_source(url)
    data, filename, content_type = download_pdf(
        source.download_url, suggested_name=source.filename
    )
    upload_id = str(uuid.uuid4())
    dest_dir = _upload_dir(upload_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    dest.write_bytes(data)
    size = dest.stat().st_size
    created = _now()
    meta = {
        "upload_id": upload_id,
        "filename": filename,
        "size": size,
        "content_type": content_type,
        "created_at": created,
        "last_task_id": None,
        "last_status": None,
        "has_zh": False,
        "source_url": url.strip(),
        "download_url": source.download_url,
    }
    _save_upload_meta(meta)
    try:
        patch = enrich_metadata(source.arxiv_id, source.doi)
        if patch:
            patch["metadata_identified_at"] = created
            library_db.upsert_paper(upload_id, patch)
    except Exception:
        pass
    return _agent_get_upload(upload_id) or meta


def _agent_create_parse_task(
    *,
    upload_id: str,
    translate: bool = False,
    parse_backend: str = "hybrid-engine",
    beautify: bool = False,
    server_url: str | None = None,
) -> dict[str, Any]:
    upload_path = _resolve_upload_file(upload_id)
    if upload_path is None:
        raise ValueError("upload_id not found")
    task_id = str(uuid.uuid4())
    now = _now()
    task: dict[str, Any] = {
        "task_id": task_id,
        "filename": upload_path.name,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "error": None,
        "upload_id": upload_id,
        "upload_path": str(upload_path),
        "translate": bool(translate),
        "beautify": bool(beautify),
        "parse_backend": parse_backend or "hybrid-engine",
        "server_url": server_url,
        "result": None,
    }
    _save_task(task)
    threading.Thread(target=_run_task, args=(task_id,), daemon=True).start()
    return {"task_id": task_id, "status": "queued", "upload_id": upload_id}


def _agent_create_translate_task(*, task_id: str, beautify: bool = False) -> dict[str, Any]:
    task = _load_task(task_id)
    if not task:
        raise ValueError("task not found")
    md_path = _task_path(task_id) / "document.md"
    if not md_path.is_file():
        raise ValueError("document.md not found; finish layout analysis before translating")
    if task.get("status") in {"queued", "parsing", "translating"}:
        raise ValueError(f"task is busy ({task.get('status')})")
    task["status"] = "translating"
    task["translate"] = True
    task["beautify"] = bool(beautify)
    task["updated_at"] = _now()
    task["error"] = None
    _save_task(task)
    threading.Thread(
        target=_run_translate_only,
        kwargs={"task_id": task_id, "beautify": bool(beautify)},
        daemon=True,
    ).start()
    return {"task_id": task_id, "status": "translating", "upload_id": task.get("upload_id")}


def _agent_get_task(task_id: str) -> dict[str, Any] | None:
    return _load_task(task_id)


def _agent_patch_paper(upload_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    tags = patch.pop("tags", None) if "tags" in patch else None
    paper_patch = dict(patch)
    if any(
        k in paper_patch
        for k in ("title", "authors", "year", "doi", "abstract", "venue", "venue_type", "arxiv_id")
    ):
        paper_patch.setdefault("metadata_source", "manual")
    paper = library_db.upsert_paper(upload_id, paper_patch) if paper_patch else (
        library_db.get_paper(upload_id) or {"upload_id": upload_id}
    )
    if tags is not None:
        paper = library_db.set_paper_tags(upload_id, list(tags))
    reindex_upload(upload_id)
    return paper


def _agent_search_library(query: str, limit: int) -> dict[str, Any]:
    ids = library_db.search_upload_ids(query, limit=limit)
    return {"query": query, "upload_ids": ids}


def _agent_export_citation(upload_id: str, fmt: str) -> str:
    from start_api.citations import format_citation

    paper = library_db.get_paper(upload_id) or {"upload_id": upload_id}
    paper = dict(paper)
    paper.setdefault("upload_id", upload_id)
    meta = _load_upload_meta(upload_id) or {}
    filename = meta.get("filename")
    if filename:
        paper.setdefault("filename", filename)
    cite_fmt: Literal["bibtex", "ris"] = "ris" if fmt == "ris" else "bibtex"
    return format_citation(paper, cite_fmt, filename=filename)


def _agent_read_paper_markdown(upload_id: str, source: str) -> str:
    meta = _load_upload_meta(upload_id)
    if not meta:
        raise FileNotFoundError(f"upload not found: {upload_id}")
    task_id = meta.get("last_task_id")
    if not task_id:
        raise FileNotFoundError("尚无解析任务，请先 parse_document")
    work = _task_path(str(task_id))
    path = work / ("document_zh.md" if source == "zh" else "document.md")
    if not path.is_file():
        label = "译文" if source == "zh" else "原文"
        raise FileNotFoundError(f"{label}不存在：{path.name}")
    return path.read_text(encoding="utf-8", errors="ignore")


configure_agent(
    AgentDeps(
        health=health,
        list_uploads=_list_upload_metas,
        get_upload=_agent_get_upload,
        upload_from_url=_agent_upload_from_url,
        create_parse_task=_agent_create_parse_task,
        create_translate_task=_agent_create_translate_task,
        get_task=_agent_get_task,
        get_paper=library_db.get_paper,
        patch_paper=_agent_patch_paper,
        search_library=_agent_search_library,
        export_citation=_agent_export_citation,
        read_paper_markdown=_agent_read_paper_markdown,
        resolve_upload_id_for_task=lambda tid: (_load_task(tid) or {}).get("upload_id"),
    )
)


def main() -> None:
    import uvicorn

    uvicorn.run(
        "start_api.main:app",
        host=os.getenv("START_API_HOST", "0.0.0.0"),
        port=int(os.getenv("START_API_PORT", "8080")),
        reload=False,
    )


if __name__ == "__main__":
    main()
