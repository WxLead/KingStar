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

## 一键启动（推荐）

在仓库根目录执行，支持 **窗口** / **后台** 两种模式：

```powershell
cd D:\desktop\StarT

# 窗口模式（默认）：每个服务单独弹一个终端，方便看日志
.\scripts\dev-up.ps1

# 后台模式：不弹终端，日志写到 scripts/.logs/
.\scripts\dev-up.ps1 -Background
```

快捷方式：

| 文件 | 效果 |
|------|------|
| `scripts\dev-up.cmd` | 窗口模式 |
| `scripts\dev-up-bg.cmd` | 后台模式 |

| 服务 | 地址 |
|------|------|
| Web | http://127.0.0.1:3000 |
| BFF 健康检查 | http://127.0.0.1:8080/api/v1/health |
| MinerU 文档 | http://127.0.0.1:8000/docs |

停止（两种模式通用，按端口 + 记录的进程收尾）：

```powershell
.\scripts\dev-down.ps1
```

常用参数：

```powershell
# MinerU 已在跑，只起 BFF + Web
.\scripts\dev-up.ps1 -SkipMinerU
.\scripts\dev-up.ps1 -Background -SkipMinerU

# MinerU 不在默认路径时
.\scripts\dev-up.ps1 -MinerUHome "D:\path\to\MinerU"
# 或先设环境变量：$env:MINERU_HOME = "D:\path\to\MinerU"

# 后台时看日志
Get-Content .\scripts\.logs\bff.log -Wait
Get-Content .\scripts\.logs\web.log -Wait
Get-Content .\scripts\.logs\mineru.log -Wait
```

> 首次仍需按下方完成依赖安装（api venv、`npm install`、MinerU 环境）。一键脚本只负责日常启动。

---

## 三端启动（本地开发 · 分终端）

需要 **三个终端** 同时跑：MinerU 引擎 → BFF → Web。首次安装依赖后，日常更推荐用上面的 **一键启动**。

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

结构化数据（笔记 / 文献元数据 / 标签 / 收藏 / 检索索引）存在 `START_DATA_DIR/start.db`（SQLite）；PDF 与解析产物仍在 `uploads/`、`tasks/` 目录。默认数据目录为 `services/api/.data`（可用环境变量 `START_DATA_DIR` 覆盖）。设置页「运行状态」也会显示当前路径。

**备份数据目录：**

```powershell
# 默认打包 services/api/.data → backups/start-data-<时间戳>.zip
.\scripts\backup-data.ps1

# 或指定目录
.\scripts\backup-data.ps1 -DataDir $env:START_DATA_DIR
```

恢复：先停 BFF，将 zip 解压覆盖到数据目录后再启动。

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
