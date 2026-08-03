# StarT

论文 **解析 · 翻译 · 解读** 产品 monorepo。

```text
apps/web              前端（Vite + React）
services/api          产品 BFF（FastAPI）— 前端唯一后端入口
services/parse        MinerU HTTP 适配层（不改 MinerU 源码）
services/translate    英译中 + PDF（原 Translation）
services/interpret    解读（预留）
packages/shared       前后端契约
docker/               Compose
docs/                 架构与本地开发说明
```

## 三端启动（本地开发）

需要 **三个终端** 同时跑：MinerU 引擎 → BFF → Web。首次安装依赖后，日常只需执行「启动」命令。

| 服务 | 端口 | 说明 |
|------|------|------|
| MinerU | `8000` | 版面分析引擎（独立仓库 / pip 安装） |
| BFF | `8080` | StarT API，前端唯一后端入口 |
| Web | `3000` | 前端；`/api` 代理到 BFF |

更细的环境变量与排错见 [docs/local-dev.md](docs/local-dev.md)。

---

### 1. MinerU（引擎）

在已安装 MinerU 的环境中启动（例如 `D:\desktop\MinerU` 的 venv / conda）：

```powershell
cd D:\desktop\MinerU
# 若使用项目 venv：
.\.venv\Scripts\Activate.ps1

mineru-api --host 127.0.0.1 --port 8000
```

- 文档：http://127.0.0.1:8000/docs
- 显存紧张时可先关掉公式/表格再启动：

```powershell
$env:MINERU_FORMULA_ENABLE = "false"
$env:MINERU_TABLE_ENABLE = "false"
mineru-api --host 127.0.0.1 --port 8000
```

> BFF 默认连接 `MINERU_API_URL=http://127.0.0.1:8000`。

---

### 2. BFF（`services/api`）

**首次：**

```powershell
cd D:\desktop\StarT\services\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ../parse -e ../translate -e .
```

**日常启动：**

```powershell
cd D:\desktop\StarT\services\api
.\.venv\Scripts\Activate.ps1
uvicorn start_api.main:app --reload --port 8080
```

- 健康检查：http://127.0.0.1:8080/api/v1/health（`mineru` 应为 `up`）
- 可选环境变量：`MINERU_API_URL`、`DEEPSEEK_API_KEY`、`START_DATA_DIR`

---

### 3. Web（`apps/web`）

**首次：**

```powershell
cd D:\desktop\StarT\apps\web
npm install
```

**日常启动：**

```powershell
cd D:\desktop\StarT\apps\web
npm run dev
```

- 页面：http://127.0.0.1:3000
- Vite 将 `/api` 代理到 `http://127.0.0.1:8080`

---

### 启动顺序建议

1. 先起 **MinerU**（`:8000`）
2. 再起 **BFF**（`:8080`）
3. 最后起 **Web**（`:3000`）

解析流程：浏览器上传 PDF → BFF 调 MinerU `/file_parse` → 前端拉取 `markdown` + `middle.json` 展示框选与 Markdown。

## Docker（可选）

```powershell
cd docker
docker compose -f docker-compose.yml up --build
```

无 Docker MinerU 时，宿主机跑 `mineru-api`，并设置 `MINERU_API_URL`（见 `docker/README.md`）。

## Docs

- [Local development](docs/local-dev.md)
- [Architecture](docs/architecture.md)
- [API contracts](docs/api-contracts.md)
- [Retire standalone folders](docs/retire-standalone.md)
