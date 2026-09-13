# Local development

## Prerequisites

- Node 18+（推荐 20+）
- Python 3.10–3.13
- Optional: GPU + MinerU models for real parse
- DeepSeek API key（翻译 / 阅读室 AI / **研究助手必需**）

日常优先用仓库根目录一键启动：`.\scripts\dev-up.ps1`（说明见 [README.md](../README.md#-快速开始)）。分终端命令与下文补充说明仍可用。

## 1. Web

```powershell
cd apps/web
npm install   # 首次
npm run dev
```

Opens on `http://127.0.0.1:3000`. Vite proxies `/api` → BFF `8080`。首页为**研究助手**（`/`），版面解析在 `/parse`。

## 2. BFF（含 Agent / MCP）

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ../parse -e ../translate -e .
# harness SDK 若为预发布：pip install --pre -e .
uvicorn start_api.main:app --reload --port 8080
```

Env (example):

```text
MINERU_API_URL=http://127.0.0.1:8000
DEEPSEEK_API_KEY=sk-...
START_DATA_DIR=../../.data
```

Health: `http://127.0.0.1:8080/api/v1/health`  
MCP: `http://127.0.0.1:8080/mcp`  

Agent 变量详见 [agent.md](./agent.md)。

## 3. MinerU API (engine)

From installed `mineru` or `/path/to/MinerU`:

```powershell
cd /path/to/MinerU
.\.venv\Scripts\Activate.ps1   # 若使用项目 venv
mineru-api --host 127.0.0.1 --port 8000
```

Docs: `http://127.0.0.1:8000/docs`

Low VRAM (optional):

```powershell
$env:MINERU_FORMULA_ENABLE = "false"
$env:MINERU_TABLE_ENABLE = "false"
mineru-api --host 127.0.0.1 --port 8000
```

## 4. Translate CLI (debug)

```powershell
cd services/translate
pip install -e .
copy .env.example .env   # fill DEEPSEEK_API_KEY
python -m start_translate.cli direct examples/MinerU.md
```

## Docker（WIP / 待完善）

`docker/` 下有产品编排草稿，**当前仍存在问题，不推荐作为主开发或部署路径**。请优先本页本地流程；实验性说明见 [docker/README.md](../docker/README.md)。
