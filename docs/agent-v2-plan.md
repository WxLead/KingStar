# 研究助手 v2（Harness 语义 × StarT 文献域）

## 默认决策

- **底仓**：`main`（不直接把 `feat/agent-workspace` 整支合并后硬改）。
- **复用**：从 `feat/agent-workspace` **拣选** UI、文献 tools、SSE 体验；存储与循环按 harness 语义重做。
- **不依赖**：不 vendoring Cordis / 不把 `deepseek-harness` 打进产品依赖；预览版 sidecar 后置。
- **产品入口**：侧栏「研究助手」=`/`；「版面解析」=`/parse`。

## 目标架构

```text
apps/web 研究助手
    │ SSE / REST
services/api BFF
    ├─ agent runtime (turn / step)
    ├─ session event log   ← 模型可见 ⟺ 已落盘
    ├─ paper tool registry
    └─ parse / translate / library → MinerU / LLM
```

原则（来自 dsh，落在 StarT）：

1. **model-visible ⟺ logged**：模型上下文只从会话事件日志投影。
2. **turn / step**：用户一条目标 = turn；每次 LLM 请求 + 其 tool 调用 = step。
3. **工具是能力缝**：文献 tools 注册表 + 统一 `ToolResult`；长任务发 `job_progress`。
4. **Plan / confirm 门**：高成本或破坏性动作先计划或确认。
5. **浏览器只打 BFF**。

## 与 feat/agent-workspace 的关系

| 保留/移植 | 重做 |
|-----------|------|
| 文献 tools 集合与 schema | 用 session log 替代「仅 timeline + sessionStorage」 |
| AgentPage 流式 + Markdown 渲染 | turn/step 状态机与取消边界 |
| 侧栏路由与文案 | plan / todo / needs_confirm |
| `packages/shared` 契约思路 | compaction、事件投影 API |

## 数据模型（SQLite，`start.db`）

- `agent_sessions`：`session_id`, `title`, `created_at`, `updated_at`
- `agent_events`：追加写；`event_id`, `session_id`, `seq`, `type`, `payload_json`, `created_at`
- 事件类型：`user_message` | `assistant_delta` | `assistant_message` | `tool_call` | `tool_result` | `job_progress` | `plan` | `todo` | `needs_confirm` | `confirm_response` | `compact_summary` | `turn_end` | `error`
- 可选：`agent_turns` 索引 turn 起止 seq

投影：`GET /api/v1/agent/sessions/{id}/events`；前端时间线只渲染投影。

## 运行时（`services/api/src/start_api/agent/`）

- `session_log.py`：append / list / derive_messages
- `runtime.py`：turn 循环；LLM stream；写 log；yield SSE
- `registry.py` + tools：文献工具（从 feat 移植）
  - `health_check`, `library_search|get|update`, `upload_from_url`, `parse_document`, `translate_document`, `get_paper_text`, `export_citation`, `get_task_status`
- `jobs.py`：parse/translate 后台 + `job_progress`
- `plan.py`：plan 事件 + confirm 后再跑高成本 tools
- `router.py`：sessions / turns(SSE) / confirm / cancel / events

领域注入：`configure_agent(AgentDeps)`，避免与 `main.py` 循环依赖。

## 前端

- `AgentPage`：绑定 `session_id`；挂载拉 events；发送走 turn SSE
- Enter 发送 / Shift+Enter 换行；清空 = 新 session
- Markdown 渲染复用阅读室路径
- plan 卡片 + confirm 按钮

## 明确不做（本阶段）

- 引入 Cordis / `npx dsh` 进安装路径
- 默认开放 bash / 写盘
- 向量 RAG / interpret 完整产品化（预留位即可）
- 用 dsh Web 替换 StarT UI

## 实施顺序

1. 契约 + DB（`agent_contract.json` + sessions/events）
2. session_log + 空 runtime SSE 打通 UI
3. 移植文献 tools + deps 注入
4. job_progress + 取消
5. plan / needs_confirm MVP（parse/translate）
6. 路由/侧栏/文档（`docs/agent.md`）

## 验收

1. 刷新或切页后同一 `session_id` 时间线从服务端恢复
2. 流式 Markdown 正常；Enter 可发送
3. 「arXiv 入库并解析」自动调 tools；MinerU down 时失败可读
4. 解析前可出现 plan/confirm（可配置开关）
5. 事件表可查完整 tool 审计；main 无 dsh 依赖

## 二期（占位）

- Compaction；语义检索 tool；interpret 四卡
- 可选：Python SDK → `dsh --profile sdk` sidecar
