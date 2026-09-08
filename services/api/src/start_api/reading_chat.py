"""Reading-room AI chat via DeepSeek (OpenAI-compatible API)."""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from typing import Any, Literal

from pydantic import BaseModel, Field

# Soft budget for reading-room Q&A (not the model's 1M hard limit).
SOFT_BUDGET_TOKENS = int(os.getenv("START_AI_CONTEXT_BUDGET", "500000"))
OUTPUT_RESERVE_TOKENS = int(os.getenv("START_AI_OUTPUT_RESERVE", "4096"))
COMPACT_RATIO = float(os.getenv("START_AI_COMPACT_RATIO", "0.8"))
MAX_PAPER_TOKENS = int(os.getenv("START_AI_PAPER_TOKENS", "24000"))
MAX_HISTORY = 40
KEEP_RECENT_MESSAGES = 6


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=32_000)


class ReadingChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=16_000)
    filename: str = Field(default="", max_length=512)
    markdown: str = Field(default="")
    zh_markdown: str = Field(default="")
    """Optional short digest; when set, preferred over full markdown for later turns."""
    paper_digest: str = Field(default="")
    history: list[ChatMessage] = Field(default_factory=list, max_length=MAX_HISTORY)


class ReadingChatResponse(BaseModel):
    reply: str
    model: str


from start_api.llm_config import (
    completion_extra_body,
    clear_llm_settings_cache,
    load_llm_config,
)


def load_deepseek_config() -> tuple[str, str, str]:
    """Backward-compatible alias → shared OpenAI-compatible LLM settings."""
    return load_llm_config()


def clear_deepseek_config_cache() -> None:
    clear_llm_settings_cache()


def estimate_tokens(text: str) -> int:
    """Heuristic for mixed CN/EN academic text (~0.5–0.6 token/char average)."""
    if not text:
        return 0
    return max(1, (len(text) + 1) // 2)


def _clip_to_tokens(text: str, max_tokens: int) -> str:
    text = (text or "").strip()
    if estimate_tokens(text) <= max_tokens:
        return text
    # chars ≈ 2 * tokens for our heuristic
    limit = max(200, max_tokens * 2 - 40)
    return text[:limit].rstrip() + "\n\n…（已截断）"


def build_paper_digest(markdown: str, zh_markdown: str, max_tokens: int = MAX_PAPER_TOKENS) -> str:
    """Build a bounded paper digest for sticky session context."""
    en = (markdown or "").strip()
    zh = (zh_markdown or "").strip()
    if not en and not zh:
        return ""
    if zh:
        en_budget = max_tokens // 2
        zh_budget = max_tokens - en_budget
        parts = []
        if en:
            parts.append("【英文摘要摘录】\n" + _clip_to_tokens(en, en_budget))
        parts.append("【中文译文摘录】\n" + _clip_to_tokens(zh, zh_budget))
        return "\n\n".join(parts)
    return _clip_to_tokens(en, max_tokens)


def _system_prompt(filename: str, paper_block: str) -> str:
    name = filename.strip() or "未命名文献"
    parts = [
        "你是 KingStar 阅读室的学术文献解读助手。",
        "请基于用户提供的论文内容回答问题：解释术语、总结段落、梳理方法与结论、对比原文与译文。",
        "回答使用简洁清晰的中文 Markdown（可用标题、列表、加粗）；公式请用 `$...$`（行内）或 `$$...$$`（独立成行），不要用 \\( \\) / \\[ \\] 或未加分隔符的裸 LaTeX。",
        "若文献内容不足以回答，请明确说明，不要编造未在文本中出现的实验数据或结论。",
        f"当前文献文件名：{name}",
    ]
    if paper_block.strip():
        parts.append("—— 文献上下文（可能为摘录）——\n" + paper_block.strip())
    else:
        parts.append("（当前尚未提供正文，请根据用户描述尽量帮助，并提示其先完成解析/翻译。）")
    return "\n\n".join(parts)


def _sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _messages_tokens(messages: list[dict[str, Any]]) -> int:
    return sum(estimate_tokens(str(m.get("content") or "")) + 4 for m in messages)


def _compact_history(
    client: Any,
    model: str,
    history: list[ChatMessage],
) -> tuple[list[ChatMessage], bool]:
    """Summarize older turns; keep the most recent messages verbatim."""
    if len(history) <= KEEP_RECENT_MESSAGES:
        return history, False

    older = history[:-KEEP_RECENT_MESSAGES]
    recent = history[-KEEP_RECENT_MESSAGES:]
    transcript = "\n".join(f"{m.role}: {m.content}" for m in older)
    prompt = (
        "请将以下学术阅读对话压缩为一段简洁的中文纪要（保留关键结论、术语、用户关注点），"
        "不要写成列表标题堆砌，控制在 800 字以内：\n\n"
        + _clip_to_tokens(transcript, 12000)
    )
    try:
        _, base_url, _ = load_deepseek_config()
        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": "你是对话压缩助手，只输出纪要正文。"},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        extra = completion_extra_body(base_url)
        if extra:
            create_kwargs["extra_body"] = extra
        resp = client.chat.completions.create(**create_kwargs)
        summary = (resp.choices[0].message.content or "").strip()
    except Exception:
        summary = _clip_to_tokens(transcript, 800)

    if not summary:
        return history, False

    compacted = [
        ChatMessage(
            role="user",
            content="【早期对话纪要】\n" + summary,
        ),
        ChatMessage(
            role="assistant",
            content="好的，我已记住上述讨论要点，请继续提问。",
        ),
        *recent,
    ]
    return compacted, True


def prepare_chat_messages(req: ReadingChatRequest, client: Any, model: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build budget-aware messages; may compact history. Returns (messages, usage_meta)."""
    budget = max(8000, SOFT_BUDGET_TOKENS)
    usable = max(4000, budget - OUTPUT_RESERVE_TOKENS)

    digest = (req.paper_digest or "").strip()
    if not digest:
        digest = build_paper_digest(req.markdown, req.zh_markdown, MAX_PAPER_TOKENS)
    else:
        digest = _clip_to_tokens(digest, MAX_PAPER_TOKENS)

    history = list(req.history[-MAX_HISTORY:])
    compacted = False

    def build(paper: str, hist: list[ChatMessage]) -> list[dict[str, Any]]:
        msgs: list[dict[str, Any]] = [{"role": "system", "content": _system_prompt(req.filename, paper)}]
        for item in hist:
            msgs.append({"role": item.role, "content": item.content.strip()})
        msgs.append({"role": "user", "content": req.message.strip()})
        return msgs

    messages = build(digest, history)
    used = _messages_tokens(messages)

    # Compact when over soft threshold
    if used >= int(usable * COMPACT_RATIO) and len(history) > KEEP_RECENT_MESSAGES:
        history, compacted = _compact_history(client, model, history)
        messages = build(digest, history)
        used = _messages_tokens(messages)

    # If still over budget, shrink paper then trim oldest history
    if used > usable:
        paper_budget = max(2000, usable // 3)
        digest = _clip_to_tokens(digest, paper_budget)
        messages = build(digest, history)
        used = _messages_tokens(messages)

    while used > usable and len(history) > 2:
        history = history[2:]
        messages = build(digest, history)
        used = _messages_tokens(messages)

    if used > usable:
        # Last resort: clip current user message (keep head)
        head = messages[:-1]
        user_budget = max(500, usable - _messages_tokens(head) - 8)
        messages = head + [
            {"role": "user", "content": _clip_to_tokens(req.message.strip(), user_budget)}
        ]
        used = _messages_tokens(messages)

    pct = min(100.0, round(100.0 * used / budget, 1))
    meta = {
        "used": used,
        "budget": budget,
        "pct": pct,
        "compacted": compacted,
        "paper_digest": digest,
        "model_limit": 1_000_000,
    }
    return messages, meta


def stream_chat_with_deepseek(req: ReadingChatRequest) -> Iterator[str]:
    """Yield Server-Sent Events for a DeepSeek chat completion."""
    api_key, base_url, model = load_deepseek_config()
    if not api_key:
        yield _sse(
            {
                "type": "error",
                "detail": "未配置 AI API Key。请在「通用设置 → AI API」中填写，或在 services/translate/.env 配置。",
            }
        )
        return

    try:
        from openai import OpenAI
    except ImportError:
        yield _sse(
            {
                "type": "error",
                "detail": "BFF 缺少 openai 依赖，请在 services/api 环境中 pip install openai",
            }
        )
        return

    client = OpenAI(api_key=api_key, base_url=base_url)

    try:
        messages, meta = prepare_chat_messages(req, client, model)
        yield _sse({"type": "usage", **meta})
        if meta.get("compacted"):
            yield _sse({"type": "compacted", "detail": "已压缩较早对话以释放上下文。"})

        create_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0.3,
            "stream": True,
        }
        extra = completion_extra_body(base_url)
        if extra:
            create_kwargs["extra_body"] = extra

        stream = client.chat.completions.create(**create_kwargs)
        has_text = False
        reply_parts: list[str] = []
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if not delta:
                continue
            has_text = True
            reply_parts.append(delta)
            yield _sse({"type": "delta", "text": delta})
        if not has_text:
            yield _sse({"type": "delta", "text": "（模型未返回内容，请重试。）"})
            reply_parts.append("（模型未返回内容，请重试。）")

        # Approximate post-reply usage for UI
        reply_tokens = estimate_tokens("".join(reply_parts))
        used_after = int(meta["used"]) + reply_tokens
        budget = int(meta["budget"])
        yield _sse(
            {
                "type": "done",
                "model": model,
                "used": used_after,
                "budget": budget,
                "pct": min(100.0, round(100.0 * used_after / budget, 1)),
                "paper_digest": meta.get("paper_digest") or "",
            }
        )
    except Exception as exc:
        yield _sse({"type": "error", "detail": f"AI 调用失败: {exc}"})


def chat_with_deepseek(req: ReadingChatRequest) -> ReadingChatResponse:
    """Non-streaming helper (tests / fallback)."""
    parts: list[str] = []
    model = load_deepseek_config()[2]
    for raw in stream_chat_with_deepseek(req):
        line = raw.strip()
        if not line.startswith("data: "):
            continue
        try:
            payload = json.loads(line[6:])
        except json.JSONDecodeError:
            continue
        if payload.get("type") == "delta":
            parts.append(str(payload.get("text") or ""))
        elif payload.get("type") == "done":
            model = str(payload.get("model") or model)
        elif payload.get("type") == "error":
            raise RuntimeError(str(payload.get("detail") or "DeepSeek 调用失败"))
    reply = "".join(parts).strip() or "（模型未返回内容，请重试。）"
    return ReadingChatResponse(reply=reply, model=model)
