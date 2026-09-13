# Docker · 分体部署（WIP / 待完善）

> **状态：实验性。** 当前编排与镜像仍存在已知问题，**不推荐**作为主安装或生产路径。请优先按仓库根目录 [README.md](../README.md#-快速开始) 使用本地开发脚本。下文仅保留草稿步骤，便于后续修好后继续完善。

目标形态（尚未完全稳定）：KingStar 只跑产品镜像（`docker-web` / `docker-api`）；MinerU 在 GPU 机器上单独启动，两边用 `MINERU_API_URL` 连接。

```text
本机 KingStar: web(:3000) + api(:8080)
       │
       │  MINERU_API_URL=http://<GPU服务器>:8000
       ▼
GPU 服务器: mineru-api(:8000)   ← MinerU/docker/compose.yaml --profile api
```

---

## 1. 服务器：MinerU 镜像

在 MinerU 源码目录（需 NVIDIA Container Toolkit）：

```bash
cd /path/to/MinerU
docker build -t mineru:latest -f docker/china/Dockerfile .

cd docker
docker compose -f compose.yaml --profile api up -d
curl -f http://127.0.0.1:8000/health
```

停止：`docker compose -f compose.yaml --profile api down`  
官方文档：https://opendatalab.github.io/MinerU/zh/quick_start/docker_deployment/

构建时会下载模型进镜像，体积大、耗时长。防火墙放行 **8000**。

---

## 2. 本机：KingStar web + api

仓库根目录：

```powershell
copy docker\.env.example docker\.env
# 编辑：DEEPSEEK_API_KEY（翻译/助手/识别）、MINERU_API_URL=http://<服务器IP>:8000

docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d web api
```

打开 http://127.0.0.1:3000 ；健康检查 http://127.0.0.1:8080/api/v1/health（`mineru` 应为 `up`）。

### `MINERU_API_URL`

| 场景 | 值 |
|------|-----|
| 远程 MinerU Docker | `http://<IP>:8000` |
| 本机 MinerU（给 KingStar 容器访问） | `http://host.docker.internal:8000` |

### 端口（可在 `.env` 改）

| 变量 | 默认 |
|------|------|
| `START_WEB_PORT` | 3000 |
| `START_API_PORT` | 8080 |

### 常用命令

```powershell
# 日志 / 停止（必须带 -f）
docker compose -f docker/docker-compose.yml --env-file docker/.env logs -f api web
docker compose -f docker/docker-compose.yml --env-file docker/.env down

# 改代码后 rebuild
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d web    # 仅前端
docker compose -f docker/docker-compose.yml --env-file docker/.env up --build -d api    # 仅后端

# 只改 .env → 无需 build
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d web api
```

镜像名：`docker-web:latest`、`docker-api:latest`。数据卷：`start_data` → 容器 `/data`。

---

## 何时 rebuild

| 改动 | 操作 |
|------|------|
| KingStar 前端 / `nginx.conf` / `Dockerfile.web` | `up --build -d web` |
| KingStar 后端 / `Dockerfile.api` | `up --build -d api` |
| 仅 `docker/.env` | `up -d`（不 build） |
| MinerU Dockerfile / 模型 | 在 MinerU 目录重新 `docker build` 并重启其 compose |

---

## 排错摘要

- **`mineru: down`**：服务器容器、`curl http://IP:8000/health`、安全组  
- **`compose down` not found**：根目录执行并加 `-f docker/docker-compose.yml`  
- **PDF worker / `.mjs`**：强刷缓存；nginx 需对 `.mjs` 返回 `application/javascript`  
- **译文 PDF 中文黑方块 / 非宋体**：确认 `api` 镜像已 rebuild（会安装 `SIMSUN.TTF`/`TIMES.TTF` 为系统字体）；不要用 `fonts-noto-cjk` 顶替  
- **翻译失败**：检查 `DEEPSEEK_API_KEY`
- **Agent / MCP**：当前 Docker 路径对研究助手依赖的完善度有限，优先本地跑 BFF
