"""Parse result schemas for KingStar product layer."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ParseResult:
    job_id: str
    markdown: str
    middle_json: dict[str, Any] | None = None
    content_list: list[Any] | dict[str, Any] | None = None
    images: dict[str, str] = field(default_factory=dict)  # name -> path or data-url
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "markdown": self.markdown,
            "middle_json": self.middle_json,
            "content_list": self.content_list,
            "images": self.images,
            "meta": self.meta,
        }
