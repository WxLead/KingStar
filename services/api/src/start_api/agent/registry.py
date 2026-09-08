"""OpenAI-compatible tool schemas for the research Agent."""

from __future__ import annotations

from typing import Any

from start_api.agent.tools import TOOL_HANDLERS

SYSTEM_PROMPT = """你是 StarT 的本地研究助手。你通过调用工具完成用户目标，而不是空谈步骤。

能力边界：
- 可：从 arXiv/DOI/PDF 链接入库、触发 MinerU 解析、英译中、检索文献库、读论文文本摘录、导出 BibTeX/RIS、更新标题/收藏/文件夹。
- 不可：删除文献、直接改磁盘、绕过工具编造解析结果。

工作方式：
1. 先用 health_check 或 library_search 摸清现状（若用户目标依赖服务状态）。
2. 需要时再 upload_from_url → parse_document；翻译用 translate_document。
3. parse_document / translate_document 可能需要用户确认；确认后会等待任务结束。
4. 完成后用简洁中文 Markdown 汇报 upload_id、task_id、结果或错误。
5. 引用论文内容时优先 get_paper_text（已截断），不要臆造原文没有的数据。
6. 工具失败时说明原因与下一步（例如 MinerU down、缺 API Key）。
"""


def openai_tools() -> list[dict[str, Any]]:
    """JSON schemas passed to chat.completions(tools=...)."""
    return [
        {
            "type": "function",
            "function": {
                "name": "health_check",
                "description": "Check MinerU / translate / LLM readiness.",
                "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "library_search",
                "description": "Search the local paper library by keyword (FTS) or list recent uploads when query is empty.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query; empty lists recent papers"},
                        "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "library_get",
                "description": "Get upload + bibliographic metadata for one paper.",
                "parameters": {
                    "type": "object",
                    "properties": {"upload_id": {"type": "string"}},
                    "required": ["upload_id"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "library_update",
                "description": (
                    "Update bibliographic metadata for a paper: title, authors, year, doi, "
                    "abstract, venue, venue_type (journal|conference|preprint|other), arxiv_id, "
                    "folder, favorited, tags."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
                        "title": {"type": "string"},
                        "authors": {"type": "array", "items": {"type": "string"}},
                        "year": {"type": "integer"},
                        "doi": {"type": "string"},
                        "abstract": {"type": "string"},
                        "venue": {"type": "string"},
                        "venue_type": {
                            "type": "string",
                            "enum": ["journal", "conference", "preprint", "other"],
                        },
                        "arxiv_id": {"type": "string"},
                        "folder": {"type": "string"},
                        "favorited": {"type": "boolean"},
                        "tags": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["upload_id"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "upload_from_url",
                "description": "Download a PDF from arXiv / DOI / direct URL and register it in the library.",
                "parameters": {
                    "type": "object",
                    "properties": {"url": {"type": "string"}},
                    "required": ["url"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "parse_document",
                "description": "Start MinerU layout parse for an upload. Waits until done by default.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
                        "translate": {"type": "boolean", "default": False},
                        "wait": {"type": "boolean", "default": True},
                        "parse_backend": {"type": "string", "default": "hybrid-engine"},
                    },
                    "required": ["upload_id"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "translate_document",
                "description": "Translate an already-parsed document (EN→ZH). Provide upload_id or task_id.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
                        "task_id": {"type": "string"},
                        "wait": {"type": "boolean", "default": True},
                    },
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_task_status",
                "description": "Poll a parse/translate task status.",
                "parameters": {
                    "type": "object",
                    "properties": {"task_id": {"type": "string"}},
                    "required": ["task_id"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_paper_text",
                "description": "Read truncated markdown for a paper (en or zh).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
                        "source": {"type": "string", "enum": ["en", "zh"], "default": "en"},
                    },
                    "required": ["upload_id"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "export_citation",
                "description": "Export BibTeX or RIS citation for a paper.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
                        "format": {"type": "string", "enum": ["bibtex", "ris"], "default": "bibtex"},
                    },
                    "required": ["upload_id"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def known_tool_names() -> set[str]:
    return set(TOOL_HANDLERS.keys())
