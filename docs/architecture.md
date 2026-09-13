# KingStar Architecture

KingStar is a monorepo product: **web frontend + BFF + algorithm adapters + research agent**.

## Layout

```text
KingStar/
├── apps/web/                 # React frontend (Vite)
├── services/
│   ├── api/                  # Product BFF (FastAPI) — frontend only talks here
│   │   └── …/agent/          # Harness gateway, MCP, artifacts, session log
│   ├── parse/                # MinerU HTTP client + result normalization
│   ├── translate/            # EN→ZH Markdown + PDF
│   └── interpret/            # Reserved (解读) — not implemented yet
├── packages/shared/          # Shared contracts (status enums, formats)
├── docker/                   # Compose stack (experimental / WIP)
└── docs/
```

## Data flow

```text
User → apps/web → services/api (BFF)
                      ├─→ services/parse → MinerU mineru-api
                      ├─→ services/translate → LLM
                      └─→ agent gateway → DeepSeek Harness (sdk)
                              └─ MCP /mcp → library / parse / translate / publish_report
```

| Product capability | Owner |
|---|---|
| Research assistant / 研究助手 | `services/api` agent + DeepSeek Harness |
| Artifacts / 产物台 | `agent_artifacts` + MCP `publish_report` / web_fetch bridge |
| Layout parse / 版面分析 | `services/parse` → MinerU |
| Translate / PDF | `services/translate` |
| Interpret / 解读 | `services/interpret` (reserved) |
| Upload / tasks / library / reading | `apps/web` + BFF |

## Principles

1. **Stable product contract** — the web app only calls `services/api`. Engines stay swappable.
2. **MinerU is an engine, not product source** — run `mineru-api` separately; adapt via `services/parse`.
3. **Agent brain is Harness** — literature actions stay in KingStar tools exposed over MCP.
4. **Translate is a library + CLI** — importable by the BFF; `python -m start_translate.cli` for local debug.
5. **Local-first persistence** — SQLite (`start.db`) for library, notes, tasks, agent events / artifacts.

## Task state machine

`queued → parsing → translating → done | failed`

Polling / refresh is enough for v1 (no heavy external queue).

## Local MinerU

```bash
mineru-api --host 0.0.0.0 --port 8000
```

Set `MINERU_API_URL=http://127.0.0.1:8000` for `services/api` / `services/parse`.

## Related docs

- [agent.md](./agent.md) — research assistant API & config
- [agent-artifacts-plan.md](./agent-artifacts-plan.md) — artifacts pane
- [local-dev.md](./local-dev.md) — local runbook
