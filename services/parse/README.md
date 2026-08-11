# services/parse

Thin adapter around **MinerU `mineru-api`**. Does not copy or modify MinerU source.

## Install

```powershell
cd services/parse
pip install -e .
```

## Start MinerU engine

```powershell
# from installed mineru, or /path/to/MinerU env
mineru-api --host 0.0.0.0 --port 8000
```

## Usage

```python
from start_parse import MinerUClient

client = MinerUClient("http://127.0.0.1:8000")
result = client.parse_file("paper.pdf", backend="hybrid-engine")
print(result.markdown[:200])
```

Env used by BFF: `MINERU_API_URL`.
