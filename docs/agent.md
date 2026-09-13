# KingStar 研究助手（DeepSeek Harness）

本地优先的**目标驱动执行层**：自然语言下目标 → DeepSeek Harness（`profile=sdk`）自动调研/拆步，经 **MCP** 调用 KingStar 文献工具做入库/解析/翻译/检索。

会话：KingStar SQLite event log（UI 恢复）+ dsh `DSH_HOME` 会话（模型续聊真相）。

> 阅读室 AI 仍是单篇问答；本页负责跨步骤执行。

接入设计背景见 [agent-dsh-integration-plan.md](./agent-dsh-integration-plan.md)（方案已落地，文档作参考）。
产物台见 [agent-artifacts-plan.md](./agent-artifacts-plan.md)。

---

## 入口

| 项 | 说明 |
|----|------|
| 路由 | `/`（侧栏「研究助手」） |
| 版面解析 | `/parse` |
| 发送 | Enter 发送，Shift+Enter 换行 |
| 多会话 | 顶栏会话下拉切换；支持新建 / 删除（`DELETE /sessions/{id}`） |
| 交互 | dsh 风格：用户气泡、工具折叠、Todo 停靠；有产物时右侧可隐藏产物台（报告流式 / 网页卡） |
| 确认门 | P0 不走产品 confirm；parse/translate 由 dsh 直接调 MCP（`DSH_PERMISSION_MODE=danger-full-access`） |

---

## 原理

```text
用户目标
  → POST /api/v1/agent/sessions/{id}/turns  (SSE)
  → Harness Gateway：DeepSeekHarness(profile=sdk).run(session_id=…)
  → dsh：web / todo / goal / subagent + mcp__start__*
  → MCP /mcp → tools.py → 文献库 / MinerU / 翻译
  → notifications → KingStar SSE + agent_events
```

---

## 工具（MCP `serverName: start`）

模型侧名：`mcp__start__health_check` 等。

`health_check` · `library_search|get|update` · `upload_from_url` · `parse_document` · `translate_document` · `get_paper_text` · `export_citation` · `get_task_status` · `publish_report`

另有 dsh 自带 web / todo / goal / subagent 等。

产物台：右侧「有产物才展开」；详见 [agent-artifacts-plan.md](./agent-artifacts-plan.md)。

---

## API

| 方法 | 路径 |
|------|------|
| POST | `/api/v1/agent/sessions` |
| GET | `/api/v1/agent/sessions` |
| GET | `/api/v1/agent/sessions/{id}/events` |
| GET | `/api/v1/agent/sessions/{id}/artifacts` |
| GET | `/api/v1/agent/sessions/{id}/artifacts/{aid}` |
| PATCH | `/api/v1/agent/sessions/{id}/artifacts/{aid}`（重命名 / 改状态） |
| DELETE | `/api/v1/agent/sessions/{id}/artifacts/{aid}` |
| POST | `/api/v1/agent/sessions/{id}/archive` |
| POST | `/api/v1/agent/sessions/{id}/turns`（SSE） |
| POST | `/api/v1/agent/sessions/{id}/turns/{turn_id}/confirm`（P0 noop） |
| POST | `/api/v1/agent/sessions/{id}/turns/{turn_id}/cancel` |
| POST | `/api/v1/agent/sessions/{id}/turns/{turn_id}/truncate` |

MCP：`GET/POST http://127.0.0.1:8080/mcp`（Streamable HTTP）

SSE：`turn_start` · `user_message` · `assistant_delta` · `assistant_message` · `tool_call` · `tool_result` · `job_progress` · `artifact_upsert` · `artifact_delta` · `error` · `turn_end`

---

## 配置

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` | **必需**（dsh 调模型） |
| `DEEPSEEK_BASE_URL` | 可选 |
| `START_API_PORT` | BFF 端口，默认 `8080`；MCP URL 默认 `http://127.0.0.1:{port}/mcp` |
| `START_MCP_URL` | 覆盖 MCP 绝对地址（dsh 子进程连 BFF） |
| `START_DSH_HOME` | 默认 `services/api/.data/dsh_home` |
| `START_DSH_WORKSPACE` | 默认 `services/api/.data/dsh_workspace`；实际 cwd 为 `…/sessions/{session_id}/` |
| `START_DSH_BIN` | 可选，指向旁路 monorepo 的 `dsh` 可执行/入口 |
| `START_DSH_MODEL` / `START_DSH_PROVIDER` | 可选覆盖 |
| `DSH_PERMISSION_MODE` | 默认 `danger-full-access`（开发期无人值守） |
| `MINERU_API_URL` | 解析 |

依赖：`deepseek-harness-sdk`（当前 PyPI 为预发布，安装用 `pip install --pre -e services/api`）、`fastmcp`。

启动：先起 BFF（挂载 `/mcp`），首次 turn 懒启动 dsh 子进程。

---

## 相关代码

`services/api/src/start_api/agent/`（`harness_gateway.py` · `mcp_server.py` · `notify_bridge.py`） · `apps/web/src/pages/AgentPage.tsx`
