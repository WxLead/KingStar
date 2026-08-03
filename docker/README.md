# Docker

From **repository root**:

```powershell
# Web + API only (MinerU on host)
$env:MINERU_API_URL = "http://host.docker.internal:8000"
docker compose -f docker/docker-compose.yml up --build web api

# Include MinerU service profile (requires a working MINERU_IMAGE)
docker compose -f docker/docker-compose.yml --profile mineru up --build
```

Copy `docker/.env.example` values into your environment or a local `.env` next to compose.

See also `docs/local-dev.md` and `docs/retire-standalone.md`.
