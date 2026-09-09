# Agent 产物台（Artifacts）

研究助手右侧「有产物才展开、可隐藏」的产物预览：流式报告 + L1 网页卡。

## 决策

| 项 | 选择 |
|----|------|
| 布局 | 无产物全宽；有产物展开右侧；可手动隐藏/再开 |
| 报告 | MCP `publish_report` + SSE；续写注入已有 artifact_id，append 无 id 时接到最新 drafting |
| 网页 | `web_fetch` 结果 → L1 文本卡（标题/URL/摘录） |
| Skill | 目标含调研/简报/综述等时注入 `research-brief` |
| 笔记 | 本迭代仅「复制」；送入阅读室笔记为后续 |

## 数据

表 `agent_artifacts`（`start.db`）：报告正文落库便于恢复；delta 事件不进 `agent_events`（与 `assistant_delta` 一样只走 live SSE）。

会话 workspace：`{START_DSH_WORKSPACE}/sessions/{session_id}/`。

## API / SSE

- `GET /api/v1/agent/sessions/{id}/artifacts`
- `GET /api/v1/agent/sessions/{id}/artifacts/{aid}`
- SSE：`artifact_upsert` · `artifact_delta`（挂在 turn 流上）

## 工具

`mcp__start__publish_report(title, mode=replace|append, content?, chunk?, artifact_id?, status=drafting|ready)`

## 前端

[`AgentPage.tsx`](../apps/web/src/pages/AgentPage.tsx) + [`ArtifactPane.tsx`](../apps/web/src/features/agent/ArtifactPane.tsx)

产物管理（会话绑定）：列表筛选、重命名、标为完成、归档、下载、删除（`PATCH` / `DELETE` artifacts）。

## P0 完成定义

- 调研类目标注入 Skill；`publish_report` 后右侧流式渲染
- `web_fetch` 出网页卡可切换
- 可隐藏产物台；刷新/切会话 REST 恢复
