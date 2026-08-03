"""Load project config.yaml with built-in defaults."""

from __future__ import annotations

import os
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
CONFIG_PATH = ROOT_DIR / "config.yaml"

DEFAULTS: dict[str, Any] = {
    "translate": {
        "concurrency": 3,
        "cache_dir": "cache/translate",
    },
    "beautify": {
        "max_chars": 3500,
        "cache_dir": "cache/html_beautify",
    },
    "pdf": {
        "page_margin": {
            "top": "18mm",
            "right": "16mm",
            "bottom": "18mm",
            "left": "16mm",
        },
        "body_max_width": "180mm",
        "image_max_height": "148.5mm",
    },
    "paths": {
        "outputs_dir": "outputs",
        "cache_root": "cache",
    },
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = deepcopy(base)
    for key, val in override.items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], val)
        else:
            out[key] = val
    return out


def _resolve_path(value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return ROOT_DIR / path


def _apply_env_overrides(cfg: dict[str, Any]) -> dict[str, Any]:
    """Optional env overrides (non-secret knobs)."""
    out = deepcopy(cfg)
    if v := os.getenv("TRANSLATION_CONCURRENCY", "").strip():
        out["translate"]["concurrency"] = int(v)
    if v := os.getenv("TRANSLATION_MAX_CHARS", "").strip():
        out["beautify"]["max_chars"] = int(v)
    if v := os.getenv("TRANSLATION_IMAGE_MAX_HEIGHT", "").strip():
        out["pdf"]["image_max_height"] = v
    if v := os.getenv("TRANSLATION_BODY_MAX_WIDTH", "").strip():
        out["pdf"]["body_max_width"] = v
    return out


@lru_cache(maxsize=1)
def load_config(path: str | None = None) -> dict[str, Any]:
    cfg = deepcopy(DEFAULTS)
    cfg_path = Path(path) if path else CONFIG_PATH
    if cfg_path.exists():
        try:
            import yaml
        except ImportError as err:
            raise SystemExit(
                "Missing dependency: pyyaml\n  pip install pyyaml"
            ) from err
        data = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
        if not isinstance(data, dict):
            raise SystemExit(f"Invalid config (expected mapping): {cfg_path}")
        cfg = _deep_merge(cfg, data)
    cfg = _apply_env_overrides(cfg)

    # Normalize relative paths against project root.
    cfg["translate"]["cache_dir"] = str(_resolve_path(cfg["translate"]["cache_dir"]))
    cfg["beautify"]["cache_dir"] = str(_resolve_path(cfg["beautify"]["cache_dir"]))
    cfg["paths"]["outputs_dir"] = str(_resolve_path(cfg["paths"]["outputs_dir"]))
    cfg["paths"]["cache_root"] = str(_resolve_path(cfg["paths"]["cache_root"]))
    return cfg


def clear_config_cache() -> None:
    load_config.cache_clear()


def outputs_dir() -> Path:
    return Path(load_config()["paths"]["outputs_dir"])


def cache_root() -> Path:
    return Path(load_config()["paths"]["cache_root"])


def translate_cache_dir() -> Path:
    return Path(load_config()["translate"]["cache_dir"])


def beautify_cache_dir() -> Path:
    return Path(load_config()["beautify"]["cache_dir"])
