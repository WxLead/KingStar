# Local development

## Prerequisites

- Node 20+
- Python 3.10–3.13
- Optional: GPU + MinerU models for real parse
- DeepSeek API key for translation (`.env` under `services/translate` or `services/api`)

日常三端启动命令已整理在仓库根目录 [README.md](../README.md#三端启动本地开发)。下文为补充说明。

## 1. Web

```powershell
cd apps/web
npm install   # 首次
npm run dev
```

Opens on `http://127.0.0.1:3000`. Vite proxies `/api` → BFF `8080`.

## 2. BFF

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ../parse -e ../translate -e .
uvicorn start_api.main:app --reload --port 8080
```

Env (example):

```text
MINERU_API_URL=http://127.0.0.1:8000
DEEPSEEK_API_KEY=sk-...
START_DATA_DIR=../../.data
```

Health: `http://127.0.0.1:8080/api/v1/health`

## 3. MinerU API (engine)

From installed `mineru` or `D:\desktop\MinerU`:

```powershell
cd D:\desktop\MinerU
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

## Docker (all-in-one sketch)

```powershell
cd docker
docker compose up --build
```

See [retire-standalone.md](retire-standalone.md) for retiring `D:\desktop\Translation` / standalone StarT layout.
