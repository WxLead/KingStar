# KingStar × DeepSeek Harness 真接入方案

> 目标：用上 **dsh 完整生态**（todo / goal / subagent / plan / web / MCP…），让研究助手能**多开会话、自动调研论文、并用 KingStar 已有工具做入库/解析/翻译/汇总**。  
> 不是再抄一层语义；大脑换成 harness，`profile="sdk"`。

## 产品能力（你要的）

| 能力 | 靠什么实现 |
|------|------------|
| 多开会话、可续聊 | dsh durable session log；UI 多 session 列表 |
| 像 Agent 自动干活 | `profile=sdk` 下的 todo / goal / ralph / subagent |
| 调研论文 | dsh 自带 web search/fetch +（可选）子代理并行 |
| 汇总整理进 KingStar | 文献 MCP tools → 调 BFF：入库/解析/翻译/检索/引用/笔记 |
| KingStar 产品壳不变 | React 研究助手；**不用** `dsh web` 当产品 UI |

## 架构

```text
┌─────────────────────────────────────────────┐
│  apps/web · 研究助手（多会话 UI）              │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│  services/api · FastAPI BFF                  │
│    · 现有：uploads / tasks / library / …     │
│    · 新增：MCP /mcp（文献 tools）             │
│    · 新增：Harness Gateway（多会话驱动）      │
└─────────┬────────────────────┬──────────────┘
          │                    │
          │ MCP tools          │ Python SDK (stdio JSON-RPC)
          ▼                    ▼
   文献能力（本机）      DeepSeekHarness(profile="sdk")
                          └── dsh-base 完整工具生态
                          └── mcp__start__* → BFF
```

**原则**

1. **大脑 = dsh**（`profile="sdk"`，不是 `sdk-minimal`）。  
2. **手脚 = KingStar**（解析/翻译/书架仍走 BFF；经 MCP 暴露给 dsh）。  
3. **UI = KingStar**（不要用 `dsh web` 替换产品壳）。  
4. 每部署/用户隔离 `DSH_HOME` + workspace 目录。

## 文献 MCP 工具（给 dsh 用）

与现有 BFF 对齐，例如：

- `health_check` / `library_search` / `library_get` / `library_update`
- `upload_from_url` / `parse_document` / `translate_document`
- `get_paper_text` / `export_citation` / `get_task_status`
- （后续）`write_note` / `identify_metadata` / `list_uploads`

MCP 名建议：`start` → 模型侧工具名 `mcp__start__parse_document` 等。

## Harness 侧配置

- `DeepSeekHarness(profile="sdk", dsh_home=..., cwd=workspace, patches=(mcp_start.yml,))`
- patch 插入 `@deepseek-ai/dsh-mcp-client`，`transport: streamable-http`，`url: http://127.0.0.1:8080/mcp`
- 无人值守自动跑：开发期可用 `DSH_PERMISSION_MODE=danger-full-access`（沙箱 workspace）；生产再收紧
- **注意**：SDK 侧 plan 退出的「问用户」通道尚不完整；自动调研优先用 **goal + todo + subagent + web**，plan mode 作增强而非唯一路径

## 多会话 Gateway（BFF）

| API | 作用 |
|-----|------|
| `POST /api/v1/agent/sessions` | 创建会话（映射 dsh `session_id`） |
| `GET /api/v1/agent/sessions` | 列表 |
| `POST /api/v1/agent/sessions/{id}/messages` | 发送目标；SSE 转发 dsh notifications |
| `POST /api/v1/agent/sessions/{id}/cancel` | 尽力取消（关运行时/标记；SDK 中途取消能力有限） |

实现要点：

- 长驻 **一个** harness 子进程（stdio 一对一）；多会话用不同 `session_id` 复用同一 runtime。  
- `on_notification` → SSE 推给前端（tool 调用、todo、子代理起停、文本增量）。  
- 进程挂了要能重启并 resume 同 `session_id`（dsh 会话落在 `DSH_HOME`）。

## 前端（研究助手）

- 左侧/顶栏：**会话列表**（多开）  
- 主区：消息流 + tool/todo/job 时间线（可先复用现有气泡，再增强 todo 面板）  
- 输入：Enter 发送；支持「继续调研 / 整理进书架」类快捷目标  
- 不再用自研 Python tool-loop 当大脑（可删或降级为 fallback）

## 典型自动工作流（示例目标）

> 「调研 Transformer 在长上下文上的近期进展：网上搜 5 篇相关论文，挑 2 篇入库并解析，写一页中文要点记到笔记。」

期望 harness：

1. web search / fetch 找文献  
2. todo 拆步、可 subagent 并行读摘要  
3. `mcp__start__upload_from_url` → `parse_document`（可确认）  
4. `get_paper_text` + 汇总；可选写 notes  

## 分阶段落地

### P0（能跑通完整生态）

1. 安装/封装 `deepseek-harness-sdk`（或源码 path 开发）  
2. BFF：MCP `/mcp` 暴露文献 tools  
3. BFF：Harness Gateway + 多 session + SSE  
4. 前端：多会话列表 + 消息流接 Gateway  
5. 文档：启动顺序（BFF → MCP → dsh child）、环境变量

### P1（更像自动 Agent）

- Goal/todo UI 投影  
- 解析/翻译确认策略（产品层确认 vs dsh permission）  
- 子代理进度展示  
- workspace 隔离与权限模式切换

### P2

- 每用户 `DSH_HOME`  
- compaction 感知的长调研  
- interpret 卡片写入笔记 tool  

## 明确不做

- 用 `dsh web` 替换 KingStar UI  
- `profile=sdk-minimal`（缺 todo/goal/subagent）  
- 继续把自研薄 loop 当主大脑  

## 与当前 `feat/agent-v2-harness` 的关系

**P0 已落地**：`harness_gateway` + FastMCP `/mcp` + 多会话 UI；自研 OpenAI tool-loop 已退役（`runtime.py` 仅 re-export）。详见 [agent.md](./agent.md)。

## 验收

1. 同一 UI 开 ≥2 个会话，互不串话，刷新可续  
2. 一句调研目标能触发 web + todo（日志/通知可见）  
3. 能调用 KingStar MCP 完成入库/解析，书架可见产物  
4. 进程重启后同 session_id 可续聊（在 DSH_HOME 持久化前提下）  
5. `pip`/`pnpm` 产品依赖中 **没有** 把整个 Cordis monorepo 拷进 KingStar 源码树（SDK/runtime 以包或旁路进程形式存在）
