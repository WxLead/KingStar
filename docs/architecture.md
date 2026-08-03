# StarT Architecture

StarT is a monorepo product: **web frontend + BFF + algorithm adapters**.

## Layout

```text
StarT/
├── apps/web/                 # React frontend (Vite)
├── services/
│   ├── api/                  # Product BFF (FastAPI) — frontend only talks here
│   ├── parse/                # MinerU HTTP client + result normalization
│   ├── translate/            # EN→ZH Markdown + PDF (from Translation)
│   └── interpret/            # Reserved (解读) — not implemented yet
├── packages/shared/          # Shared contracts (status enums, formats)
├── docker/                   # Compose stack
└── docs/
```

## Data flow

```text
User → apps/web → services/api (BFF)
                      ├─→ services/parse → MinerU mineru-api
                      └─→ services/translate → DeepSeek
```

| Product capability | Owner |
|---|---|
| Layout parse / 版面分析 | `services/parse` → MinerU |
| Translate / PDF | `services/translate` |
| Interpret / 解读 | `services/interpret` (reserved) |
| Upload / tasks / library UI | `apps/web` |

## Principles

1. **Stable product contract** — the web app only calls `services/api`. Engines stay swappable.
2. **MinerU is an engine, not product source** — do not rewrite `mineru/` internals. Run `mineru-api` (pip / Docker / local `D:\desktop\MinerU`) and adapt via `services/parse`.
3. **Translate is a library + CLI** — importable by the BFF; `python -m start_translate.cli` for local debug.
4. **Contract first, move later** — directory and API shapes before deleting desktop copies of Translation / MinerU.

## Task state machine

`queued → parsing → translating → done | failed`

Polling is enough for v1 (no heavy queue).

## Local MinerU

Dev: start `mineru-api` from `D:\desktop\MinerU` (or installed package).

```bash
mineru-api --host 0.0.0.0 --port 8000
```

Set `MINERU_API_URL=http://127.0.0.1:8000` for `services/api` / `services/parse`.
