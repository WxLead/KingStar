"""OpenAI-compatible LLM settings shared by reading chat and translation.

Precedence (highest first):
1. Runtime override file (written by Settings UI)
2. Environment / .env (`DEEPSEEK_*` or `OPENAI_*`)
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"


class LlmSettings(BaseModel):
    api_key: str = ""
    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL


class LlmSettingsPublic(BaseModel):
    api_key_set: bool
    api_key_masked: str = ""
    base_url: str
    model: str
    source: Literal["settings", "env", "default"]


class LlmSettingsUpdate(BaseModel):
    """Partial update. Omit api_key (or send null) to keep existing key."""

    api_key: str | None = Field(default=None, max_length=512)
    base_url: str | None = Field(default=None, max_length=512)
    model: str | None = Field(default=None, max_length=256)
    clear_api_key: bool = False


class LlmModelsQuery(BaseModel):
    """Probe OpenAI-compatible GET /models. Empty fields fall back to saved settings."""

    api_key: str | None = Field(default=None, max_length=512)
    base_url: str | None = Field(default=None, max_length=512)


class LlmModelsResult(BaseModel):
    ok: bool
    models: list[str] = Field(default_factory=list)
    detail: str = ""
    base_url: str = ""


def _api_root() -> Path:
    # .../services/api/src/start_api/llm_config.py → parents[2] = services/api
    return Path(__file__).resolve().parents[2]


def _repo_root() -> Path:
    return _api_root().parent.parent


def settings_file_path() -> Path:
    override = os.getenv("START_LLM_SETTINGS", "").strip()
    if override:
        return Path(override)
    data_dir = os.getenv("START_DATA_DIR", "").strip()
    if data_dir:
        return Path(data_dir) / "llm_settings.json"
    return _api_root() / ".data" / "llm_settings.json"


def _candidate_env_files() -> list[Path]:
    api_root = _api_root()
    services = api_root.parent
    repo = services.parent
    return [
        services / "translate" / ".env",
        api_root / ".env",
        repo / ".env",
        repo / "docker" / ".env",
    ]


def _load_dotenv_files() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for path in _candidate_env_files():
        if path.is_file():
            load_dotenv(path, override=False)
    load_dotenv(override=False)


def _env_settings() -> LlmSettings:
    _load_dotenv_files()
    api_key = (
        os.getenv("DEEPSEEK_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
    )
    base_url = (
        os.getenv("DEEPSEEK_BASE_URL", "").strip()
        or os.getenv("OPENAI_BASE_URL", "").strip()
        or DEFAULT_BASE_URL
    )
    model = (
        os.getenv("DEEPSEEK_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or DEFAULT_MODEL
    )
    return LlmSettings(api_key=api_key, base_url=base_url, model=model)


def _read_override_file() -> dict[str, Any] | None:
    path = settings_file_path()
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    return raw


def _mask_key(key: str) -> str:
    key = key.strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "****" + key[-2:]
    return key[:3] + "****" + key[-4:]


@lru_cache(maxsize=1)
def get_llm_settings() -> tuple[LlmSettings, Literal["settings", "env", "default"]]:
    env = _env_settings()
    override = _read_override_file()
    if override is None:
        source: Literal["settings", "env", "default"] = "env" if env.api_key else "default"
        return env, source

    api_key = str(override.get("api_key") or "").strip() or env.api_key
    base_url = str(override.get("base_url") or "").strip() or env.base_url or DEFAULT_BASE_URL
    model = str(override.get("model") or "").strip() or env.model or DEFAULT_MODEL
    settings = LlmSettings(api_key=api_key, base_url=base_url.rstrip("/"), model=model)
    return settings, "settings"


def clear_llm_settings_cache() -> None:
    get_llm_settings.cache_clear()


def load_llm_config() -> tuple[str, str, str]:
    """Return (api_key, base_url, model) for OpenAI-compatible clients."""
    settings, _ = get_llm_settings()
    return settings.api_key, settings.base_url, settings.model


def public_llm_settings() -> LlmSettingsPublic:
    settings, source = get_llm_settings()
    return LlmSettingsPublic(
        api_key_set=bool(settings.api_key),
        api_key_masked=_mask_key(settings.api_key),
        base_url=settings.base_url,
        model=settings.model,
        source=source,
    )


def save_llm_settings(update: LlmSettingsUpdate) -> LlmSettingsPublic:
    current, _ = get_llm_settings()
    override = _read_override_file() or {}

    if update.clear_api_key:
        api_key = ""
    elif update.api_key is not None and update.api_key.strip():
        api_key = update.api_key.strip()
    else:
        # Keep previously saved override key, else current resolved key
        api_key = str(override.get("api_key") or "").strip() or current.api_key

    base_url = (
        update.base_url.strip().rstrip("/")
        if update.base_url is not None and update.base_url.strip()
        else (str(override.get("base_url") or "").strip() or current.base_url)
    )
    model = (
        update.model.strip()
        if update.model is not None and update.model.strip()
        else (str(override.get("model") or "").strip() or current.model)
    )

    payload = {
        "api_key": api_key,
        "base_url": base_url or DEFAULT_BASE_URL,
        "model": model or DEFAULT_MODEL,
    }

    path = settings_file_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # So in-process translate (same BFF) sees updates without relying only on file read
    if api_key:
        os.environ["DEEPSEEK_API_KEY"] = api_key
        os.environ["OPENAI_API_KEY"] = api_key
    else:
        os.environ.pop("DEEPSEEK_API_KEY", None)
        # Don't wipe OPENAI_API_KEY if it came from outside — only clear if we owned it via settings
        if not _env_settings().api_key:
            os.environ.pop("OPENAI_API_KEY", None)
    os.environ["DEEPSEEK_BASE_URL"] = payload["base_url"]
    os.environ["OPENAI_BASE_URL"] = payload["base_url"]
    os.environ["DEEPSEEK_MODEL"] = payload["model"]
    os.environ["OPENAI_MODEL"] = payload["model"]

    clear_llm_settings_cache()
    return public_llm_settings()


def completion_extra_body(base_url: str) -> dict[str, Any] | None:
    """Provider-specific extras. DeepSeek thinking flag breaks plain OpenAI."""
    host = (base_url or "").lower()
    if "deepseek" in host:
        return {"thinking": {"type": "disabled"}}
    return None


def list_remote_models(*, api_key: str | None = None, base_url: str | None = None) -> LlmModelsResult:
    """Call OpenAI-compatible models.list() against the given (or saved) endpoint."""
    saved, _ = get_llm_settings()
    key = (api_key or "").strip() or saved.api_key
    url = (base_url or "").strip().rstrip("/") or saved.base_url or DEFAULT_BASE_URL

    if not key:
        return LlmModelsResult(
            ok=False,
            base_url=url,
            detail="请先填写 API Key（或已在设置中保存），再查询模型列表。",
        )
    if not url:
        return LlmModelsResult(
            ok=False,
            detail="请先填写 Base URL。",
        )

    try:
        from openai import OpenAI
    except ImportError:
        return LlmModelsResult(
            ok=False,
            base_url=url,
            detail="BFF 缺少 openai 依赖，请在 services/api 环境中安装。",
        )

    try:
        client = OpenAI(api_key=key, base_url=url, timeout=20.0)
        page = client.models.list()
        ids: list[str] = []
        for item in page:
            mid = getattr(item, "id", None)
            if isinstance(mid, str) and mid.strip():
                ids.append(mid.strip())
        # Some SDKs wrap data
        if not ids and hasattr(page, "data"):
            for item in page.data or []:
                mid = getattr(item, "id", None)
                if isinstance(mid, str) and mid.strip():
                    ids.append(mid.strip())
        ids = sorted(set(ids), key=str.lower)
        if not ids:
            return LlmModelsResult(
                ok=False,
                base_url=url,
                detail="接口返回了空列表。可能是中转站未开放 /models，或 Base URL 路径不对（试试加 /v1）。仍可手动填写模型名。",
            )
        return LlmModelsResult(ok=True, models=ids, base_url=url, detail=f"共 {len(ids)} 个模型")
    except Exception as exc:
        msg = str(exc).strip() or exc.__class__.__name__
        hint = (
            "无法拉取模型列表。请检查 Base URL / API Key 是否正确；"
            "若使用中转站，对方可能未实现 /models 接口，可直接手动填写模型名。"
        )
        return LlmModelsResult(
            ok=False,
            base_url=url,
            detail=f"{hint}（{msg[:240]}）",
        )
