# StarT

本地优先的论文工作台：**解析 → 翻译 → 阅读 → 管理**。

上传或导入 PDF / arXiv 链接，经 MinerU 版面解析后可双语阅读、标注笔记、自动识别文献元数据、导出引用；LLM（DeepSeek 等）用于翻译与识别，解析引擎 MinerU 可本机或远程外接。

```text
apps/web              前端（Vite + React）
services/api          产品 BFF（FastAPI）— 前端唯一后端入口
services/parse        MinerU HTTP 适配层（不改 MinerU 源码）
services/translate    英译中 + PDF 导出
services/interpret    解读（预留）
packages/shared       前后端契约
docker/               Compose（产品镜像：web + api）
docs/                 架构与本地开发说明
scripts/              一键启停、备份
```

下文路径一律写成 `/path/to/StarT`、`/path/to/MinerU`，请换成你本机的实际目录。

---

## 目录

- [推荐架构：分体 Docker](#推荐架构分体-docker)
- [A. 分体 Docker 部署（推荐）](#a-分体-docker-部署推荐)
- [B. 本地开发（一键脚本）](#b-本地开发一键脚本)
- [C. 本地开发（分终端手动）](#c-本地开发分终端手动)
- [配置说明](#配置说明)
- [数据与备份](#数据与备份)
- [功能速览](#功能速览)
- [排错](#排错)
- [更多文档](#更多文档)

---

## 推荐架构：分体 Docker

当前推荐方式：**StarT 前后端用自己的镜像，MinerU 用官方镜像，两边分开启动**，用 HTTP 连接。

```text
┌─ 本机 / 业务机 ─────────────────┐     ┌─ GPU 服务器 ──────────────┐
│  docker-web  (:3000)            │     │  mineru:latest            │
│  docker-api  (:8080)  ────────────API──►  mineru-api (:8000)      │
│  MINERU_API_URL=http://IP:8000  │     │  (NVIDIA GPU)             │
└─────────────────────────────────┘     └───────────────────────────┘
```

| 组件 | 镜像 | 怎么起 |
|------|------|--------|
| 前端 | `docker-web` | StarT 仓库 `docker compose … up web api` |
| 后端 BFF | `docker-api` | 同上 |
| 解析引擎 | `mineru:latest` | MinerU 仓库 `compose.yaml --profile api` |

**不要**把 MinerU 打进 StarT 产品镜像；改 StarT 代码才需要 rebuild StarT 镜像，改 MinerU 才 rebuild MinerU。

---

## A. 分体 Docker 部署（推荐）

顺序建议：**先起 MinerU，再起 StarT**。更细说明见 [docker/README.md](docker/README.md)。官方 MinerU Docker：[部署文档](https://opendatalab.github.io/MinerU/zh/quick_start/docker_deployment/)。

### A1. GPU 服务器：构建并启动 MinerU

前置：Linux（或 WSL2）、Docker + Compose、NVIDIA 驱动与 [Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)，`nvidia-smi` 正常。

```bash
# 进入 MinerU 源码目录
cd /path/to/MinerU

# 1) 构建镜像（国内用 china Dockerfile；耗时长，会下载模型进镜像）
docker build -t mineru:latest -f docker/china/Dockerfile .

# 2) 启动 API（映射宿主机 8000 → 容器 8000）
cd docker
docker compose -f compose.yaml --profile api up -d

# 3) 本机验证
curl -f http://127.0.0.1:8000/health
# 文档: http://<server-ip>:8000/docs
```

常用：

```bash
docker compose -f compose.yaml logs -f mineru-api
docker compose -f compose.yaml --profile api down
docker compose -f compose.yaml ps
```

注意：

- 云安全组 / 防火墙放行 **8000**
- 若服务器上还有 venv 版 `mineru-api`，先停掉，避免抢端口和 GPU
- 显存紧张可编辑 `compose.yaml` 里 `mineru-api` 的 `command`，取消注释 `--gpu-memory-utilization 0.4` 等后重启
- 同一台机不要同时开多个占满显存的 profile（`api` / `openai-server` / `router` / `gradio`）

### A2. 本机：配置并启动 StarT（web + api）

前置：Docker Desktop / Engine + Compose v2；已能访问上面的 MinerU。

```powershell
cd /path/to/StarT

# 1) 配置（只需首次）
copy docker\.env.example docker\.env
```

编辑 `docker/.env`，至少：

```env
# AI（翻译 / 阅读助手 / 文献识别抽取）— 详见「配置说明」
DEEPSEEK_API_KEY=sk-your-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash

# 远程 GPU 上的 MinerU
MINERU_API_URL=http://<server-ip>:8000

# 端口被占用时再改
START_WEB_PORT=3000
START_API_PORT=8080
```

`MINERU_API_URL` 怎么填：

| MinerU 在哪 | `MINERU_API_URL` |
|-------------|------------------|
| 远程服务器 Docker | `http://<server-ip>:8000` |
| 本机 Docker / 本机进程（给 StarT 容器访问） | `http://host.docker.internal:8000` |
| 同 compose 网络内（暂不推荐） | `http://mineru-api:8000` |

```powershell
# 2) 构建并后台启动（首次或改了前后端代码后加 --build）
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d web api

# 日常只重启、未改代码：
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d web api

# 3) 打开
# Web:  http://127.0.0.1:3000
# 健康: http://127.0.0.1:8080/api/v1/health
```

Linux / macOS：

```bash
cd /path/to/StarT
cp docker/.env.example docker/.env
# 编辑 docker/.env
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d web api
```

健康检查正常时大致为：

```json
{"ok":true,"mineru":"up","translate":"ready","llm":"configured","data_dir":"/data"}
```

生成的镜像名：`docker-web:latest`、`docker-api:latest`；容器名通常为 `docker-web-1`、`docker-api-1`。

### A3. 日常命令（StarT）

```powershell
# 必须带 -f，在仓库根目录执行（不要只写 docker compose down）
docker compose -f docker/docker-compose.yml --env-file docker/.env logs -f api web
docker compose -f docker/docker-compose.yml --env-file docker/.env down

# 改了前端 / nginx / Dockerfile.web 后
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d web

# 改了后端代码后
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d api

# 只改 .env（Key、MinerU 地址、端口）→ 无需 build，重启即可
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d web api

# 清空文献数据（慎用）
docker compose -f docker/docker-compose.yml --env-file docker/.env down -v
```

数据在 Docker volume `start_data`（容器内 `/data`）。浏览器改前端后若异常，可 **Ctrl+F5** 强刷。

> 首次构建 `api` 较慢（Playwright Chromium）。`Dockerfile.api` 默认使用阿里云 apt 源。

> StarT 容器**不会**自动读本机 `services/translate/.env`；Key 写在 `docker/.env`，或容器起来后在网页「设置」里配置。

### 端口一览

| 服务 | 默认端口 | 说明 |
|------|----------|------|
| StarT Web | 3000 | `START_WEB_PORT`，浏览器入口 |
| StarT API | 8080 | `START_API_PORT`，健康检查；页面经 nginx 反代 `/api` |
| MinerU API | 8000 | MinerU compose 映射；写入 `MINERU_API_URL` |

---

## B. 本地开发（一键脚本）

在 StarT 仓库根目录（**首次需先完成下方「依赖安装」**）：

```powershell
cd /path/to/StarT

.\scripts\dev-up.ps1              # 窗口模式：各服务单独终端
.\scripts\dev-up.ps1 -Background  # 后台：日志在 scripts/.logs/
```

| 快捷方式 | 效果 |
|----------|------|
| `scripts\dev-up.cmd` | 窗口模式 |
| `scripts\dev-up-bg.cmd` | 后台模式 |

| 服务 | 默认地址 |
|------|----------|
| Web | http://127.0.0.1:3000 |
| BFF 健康检查 | http://127.0.0.1:8080/api/v1/health |
| MinerU 文档 | http://127.0.0.1:8000/docs |

停止：

```powershell
.\scripts\dev-down.ps1
```

常用参数：

```powershell
# MinerU 已在跑（本机或远程），只起 BFF + Web
$env:MINERU_API_URL = "http://<server-ip>:8000"
.\scripts\dev-up.ps1 -Background -SkipMinerU

# 指定本机 MinerU 目录（或先设环境变量 MINERU_HOME）
.\scripts\dev-up.ps1 -MinerUHome "/path/to/MinerU"

# 后台看日志
Get-Content .\scripts\.logs\bff.log -Wait
```

### 首次依赖安装

**1) BFF**

```powershell
cd /path/to/StarT/services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ../parse -e ../translate -e .
```

**2) Web**

```powershell
cd /path/to/StarT/apps/web
npm install
```

**3) MinerU**  
推荐用 Docker，见 [A1](#a1-gpu-服务器构建并启动-mineru)；也可用本机 venv 跑 `mineru-api`。

**4) LLM Key**  
见 [配置说明](#配置说明)（设置页或 `.env`）。

---

## C. 本地开发（分终端手动）

启动顺序建议：**MinerU → BFF → Web**。

### 1. MinerU

```powershell
cd /path/to/MinerU
.\.venv\Scripts\Activate.ps1
mineru-api --host 127.0.0.1 --port 8000
```

显存紧张时可先关公式/表格：

```powershell
$env:MINERU_FORMULA_ENABLE = "false"
$env:MINERU_TABLE_ENABLE = "false"
mineru-api --host 127.0.0.1 --port 8000
```

### 2. BFF

```powershell
cd /path/to/StarT/services/api
.\.venv\Scripts\Activate.ps1
# 可选：$env:MINERU_API_URL = "http://127.0.0.1:8000"
uvicorn start_api.main:app --reload --port 8080
```

### 3. Web

```powershell
cd /path/to/StarT/apps/web
npm run dev
```

Vite 将 `/api` 代理到 `http://127.0.0.1:8080`。

解析流程：浏览器上传 / 导入 → BFF 调 MinerU `/file_parse` → 前端展示 Markdown / 框选 / 阅读室。

---

## 配置说明

### LLM（DeepSeek / 兼容接口）用在哪里

配置的是 **OpenAI 兼容 Chat API**（默认 DeepSeek）。**不负责** PDF 版面解析——那是 MinerU。

| 能力 | 是否消耗 AI API | 说明 |
|------|-----------------|------|
| **英译中翻译** | 是 | 解析后的 Markdown / 内容块翻译；一键翻译任务 |
| **阅读室 AI 助手** | 是 | 针对当前论文的问答、解释、总结（流式对话） |
| **文献自动识别** | 部分 | AI 从正文抽出标题、作者、DOI、arXiv ID、摘要等；再拿这些信息去 **Crossref / arXiv** 补全期刊、年份等 |
| **Crossref / arXiv 查询** | 否 | 公开学术接口，**不走** DeepSeek Key |
| **MinerU 版面分析** | 否 | 独立引擎（远程/本机 GPU），走 `MINERU_API_URL` |
| **PDF 导出排版** | 否* | 用 Playwright 渲染；\*导出前若尚未翻译，翻译步骤仍会调 AI |

没有配置 Key 时：仍可上传、解析（MinerU 正常）、管理文献库；**翻译、AI 助手、依赖 AI 的识别**会不可用或降级（识别可能只靠启发式 / 已有 DOI·arXiv）。

### LLM 怎么配置

优先级（高 → 低）：

1. **设置页**保存的配置 → 写入 `llm_settings.json`
2. 环境变量 / `.env`（`DEEPSEEK_*` 或 `OPENAI_*`）
3. 默认 Base URL / 模型名

**本地开发推荐：** 打开前端 → **设置** → 填写 API Key / Base URL / 模型。  
文件默认在：`services/api/.data/llm_settings.json`（若设置了 `START_DATA_DIR` 则在该目录下）。

**也可用 `.env`（本地）：** BFF 会尝试加载：

- `services/translate/.env`（有示例 `services/translate/.env.example`）
- `services/api/.env`
- 仓库根目录 `.env`

```env
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
```

**Docker：** 用 `docker/.env`，或容器启动后在设置页配置（写入 volume，与本机文件相互独立）。

### 其它常用环境变量

| 变量 | 说明 |
|------|------|
| `MINERU_API_URL` | MinerU 根地址；分体 Docker 时填远程 `http://<server-ip>:8000` |
| `START_DATA_DIR` | SQLite 与 `llm_settings.json` 等目录；本地默认 `services/api/.data`，Docker 为 `/data` |
| `MINERU_HOME` | 本地一键脚本启动 MinerU 时的安装目录（也可用 `-MinerUHome`） |

---

## 数据与备份

| 内容 | 本地默认位置 | Docker |
|------|--------------|--------|
| 笔记 / 文献元数据 / 标签 / 收藏 / 检索 | `START_DATA_DIR/start.db` | volume `start_data` → `/data` |
| 上传 PDF、解析任务产物 | `services/api` 下 `uploads/`、`tasks/` 等 | 同数据卷策略（见实现） |
| LLM 设置 | `…/llm_settings.json` | `/data/llm_settings.json` |

本地备份：

```powershell
cd /path/to/StarT
.\scripts\backup-data.ps1
# 或
.\scripts\backup-data.ps1 -DataDir $env:START_DATA_DIR
```

恢复：先停 BFF / 容器，将 zip 解压覆盖到数据目录后再启动。

设置页「运行状态」会显示当前数据目录与健康信息。

---

## 功能速览

- **解析**：PDF / 扫描图上传；任务管理与重试  
- **导入**：arXiv / DOI / PDF 直链（网盘暂不支持）  
- **翻译**：英译中；可导出 PDF（依赖 Playwright）  
- **阅读室**：双语阅读、笔记、标注（持续完善）  
- **文献库**：书架、收藏、拖拽排序、元数据编辑  
- **识别**：AI + Crossref / arXiv 回填标题、作者、`arxiv_id` 等；封面 arXiv 徽章  
- **引用**：BibTeX / RIS 导出  

产品路线见 [ROADMAP.md](ROADMAP.md)。

---

## 排错

| 现象 | 排查 |
|------|------|
| 健康检查 `mineru: down` | 服务器 MinerU 容器是否在跑；`MINERU_API_URL`；防火墙 8000；本机可用浏览器打开 `http://<server-ip>:8000/docs` |
| PDF 预览 worker 报错 | 强刷 Ctrl+F5；确认 web 镜像已含正确 nginx（`.mjs` → `application/javascript`） |
| `llm` 未配置 / 翻译失败 | 设置页或对应 `.env` 的 API Key；Docker 需 `docker/.env` 或容器内设置页 |
| 端口占用 | Docker 改 `START_WEB_PORT` / `START_API_PORT`；本地改启动命令端口或先 `dev-down` |
| Docker `api` 构建 apt 失败 | 网络访问 Debian 源；`Dockerfile.api` 已用阿里云镜像，可重试 `build api` |
| Docker 导出镜像报 `already exists` | `docker rmi docker-api:latest` 后再 `build` |
| `docker compose down` 报 not found | 必须带 `-f docker/docker-compose.yml`，在仓库根目录执行 |
| 上传大 PDF 失败 | nginx 已放宽到 200m；看 api 日志 |
| 本机与 Docker 文献库不一致 | 两套数据目录，属预期 |

---

## 更多文档

- [docker/README.md](docker/README.md) — Docker 部署细节  
- [docs/local-dev.md](docs/local-dev.md) — 本地开发补充  
- [docs/architecture.md](docs/architecture.md) — 架构  
- [docs/api-contracts.md](docs/api-contracts.md) — API 契约  
- [ROADMAP.md](ROADMAP.md) — 产品优化路线  
