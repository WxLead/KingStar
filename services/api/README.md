# services/api — StarT BFF

Frontend talks **only** to this service (`:8080`).

## Run

```powershell
cd services/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ../parse -e ../translate -e .

$env:MINERU_API_URL = "http://127.0.0.1:8000"
$env:DEEPSEEK_API_KEY = "sk-..."   # needed when translate=true
uvicorn start_api.main:app --reload --port 8080
```

Data directory: `services/api/.data` (or `START_DATA_DIR`).

Docs: `/docs` when server is up. Contracts: `../../docs/api-contracts.md`.
