"""HTTP client for MinerU mineru-api / mineru-router."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx

from start_parse.normalize import normalize_mineru_response
from start_parse.schemas import ParseResult

DEFAULT_TIMEOUT = 600.0


class MinerUClient:
    def __init__(self, base_url: str = "http://127.0.0.1:8000", timeout: float = DEFAULT_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def health(self) -> dict[str, Any]:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(f"{self.base_url}/health")
            r.raise_for_status()
            return r.json()

    def parse_file(
        self,
        file_path: str | Path,
        *,
        backend: str = "hybrid-engine",
        server_url: str | None = None,
        return_md: bool = True,
        return_middle_json: bool = True,
        return_content_list: bool = True,
        return_images: bool = False,
        lang_list: list[str] | None = None,
    ) -> ParseResult:
        """Synchronous parse via POST /file_parse."""
        path = Path(file_path)
        data: dict[str, Any] = {
            "backend": backend,
            "return_md": str(return_md).lower(),
            "return_middle_json": str(return_middle_json).lower(),
            "return_content_list": str(return_content_list).lower(),
            "return_images": str(return_images).lower(),
        }
        if server_url:
            data["server_url"] = server_url
        if lang_list:
            data["lang_list"] = lang_list

        with path.open("rb") as f:
            files = {"files": (path.name, f, "application/octet-stream")}
            with httpx.Client(timeout=self.timeout) as client:
                r = client.post(f"{self.base_url}/file_parse", data=data, files=files)
                r.raise_for_status()
                payload = r.json()

        job_id = str(payload.get("task_id") or payload.get("job_id") or path.stem)
        return normalize_mineru_response(
            payload,
            job_id=job_id,
            backend=backend,
            source_filename=path.name,
        )

    def submit_task(self, file_path: str | Path, *, backend: str = "hybrid-engine") -> str:
        """Async submit via POST /tasks; returns task_id."""
        path = Path(file_path)
        data = {
            "backend": backend,
            "return_md": "true",
            "return_middle_json": "true",
            "return_content_list": "true",
        }
        with path.open("rb") as f:
            files = {"files": (path.name, f, "application/octet-stream")}
            with httpx.Client(timeout=60.0) as client:
                r = client.post(f"{self.base_url}/tasks", data=data, files=files)
                r.raise_for_status()
                body = r.json()
        task_id = body.get("task_id") or body.get("id")
        if not task_id:
            raise RuntimeError(f"MinerU /tasks response missing task_id: {body}")
        return str(task_id)

    def wait_result(
        self,
        task_id: str,
        *,
        backend: str = "hybrid-engine",
        source_filename: str = "",
        poll_interval: float = 1.0,
        timeout: float | None = None,
    ) -> ParseResult:
        deadline = time.time() + (timeout or self.timeout)
        with httpx.Client(timeout=60.0) as client:
            while time.time() < deadline:
                st = client.get(f"{self.base_url}/tasks/{task_id}")
                st.raise_for_status()
                status_body = st.json()
                status = str(status_body.get("status") or status_body.get("state") or "").lower()
                if status in {"done", "completed", "success", "finished"}:
                    res = client.get(f"{self.base_url}/tasks/{task_id}/result")
                    res.raise_for_status()
                    # JSON result preferred; zip would need extra handling
                    try:
                        payload = res.json()
                    except Exception as err:
                        raise RuntimeError(
                            "MinerU result is not JSON; request return_* flags / non-zip format"
                        ) from err
                    return normalize_mineru_response(
                        payload,
                        job_id=task_id,
                        backend=backend,
                        source_filename=source_filename,
                    )
                if status in {"failed", "error", "cancelled"}:
                    raise RuntimeError(f"MinerU task failed: {status_body}")
                time.sleep(poll_interval)
        raise TimeoutError(f"MinerU task {task_id} timed out")
