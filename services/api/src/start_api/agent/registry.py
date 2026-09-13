"""OpenAI-compatible tool schemas for the research Agent."""

from __future__ import annotations

from typing import Any

from start_api.agent.tools import TOOL_HANDLERS

SYSTEM_PROMPT = """你是 KingStar 的本地研究助手。你通过调用工具完成用户目标，而不是空谈步骤。

能力边界：
- 可：网页调研、publish_report 流式报告；检索文献库；在用户明确要求时从 arXiv/DOI/PDF 链接入库、触发 MinerU 解析、英译中、读论文文本、导出 BibTeX/RIS、更新元数据。
- 不可：删除文献、直接改磁盘、绕过工具编造解析结果；用户未要求时自动入库/解析/翻译。

工作方式：
1. 调研/简报/综述：web 检索 + publish_report；可用 library_search 只读查看本地库。不要默认 upload/parse/translate。
2. 仅当用户明确说入库/导入/解析/翻译或点名要导入某 URL 时，再调用对应工具。
3. 完成后用简洁中文 Markdown 汇报；需要时可在末尾只反问一个后续问题（例如是否入库某篇），然后等待。
4. 引用论文内容时优先 get_paper_text（原文 document.md 全文），不要臆造；不要读译文。
5. 工具失败时说明原因与下一步（例如 MinerU down、缺 API Key）。
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
                "description": (
                    "Download a PDF from arXiv / DOI / direct URL and register it in the library. "
                    "Call only when the user explicitly asks to 入库/导入 or to import this URL."
                ),
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
                "description": (
                    "Start MinerU layout parse for an upload. Waits until done by default. "
                    "Call only when the user explicitly asks to 解析/parse."
                ),
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
                "description": (
                    "Translate an already-parsed document (EN→ZH). Provide upload_id or task_id. "
                    "Call only when the user explicitly asks to 翻译/translate."
                ),
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
                "description": "Read the full original paper markdown (document.md). Never returns the Chinese translation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "upload_id": {"type": "string"},
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
        {
            "type": "function",
            "function": {
                "name": "publish_report",
                "description": (
                    "Publish or stream a research report to the KingStar artifact pane. "
                    "Use mode=replace only for a brand-new report. "
                    "To continue an interrupted/drafting report, pass its artifact_id with mode=append. "
                    "Set status=ready when finished."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "mode": {"type": "string", "enum": ["replace", "append"], "default": "replace"},
                        "content": {"type": "string", "description": "Full or initial markdown body"},
                        "chunk": {"type": "string", "description": "Incremental markdown chunk (append)"},
                        "artifact_id": {"type": "string"},
                        "status": {
                            "type": "string",
                            "enum": ["drafting", "ready", "error"],
                            "default": "drafting",
                        },
                    },
                    "additionalProperties": False,
                },
            },
        },
    ]


def known_tool_names() -> set[str]:
    return set(TOOL_HANDLERS.keys())
