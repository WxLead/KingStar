# Retiring standalone desktop copies

After this monorepo is the source of truth:

| Former path | Status |
|---|---|
| `D:\desktop\StarT` (flat Vite app) | Absorbed into `apps/web` |
| `D:\desktop\Translation` | Absorbed into `services/translate` — keep old folder as backup until you verify CLI parity, then archive/delete |
| `D:\desktop\MinerU` | **Keep as engine source / local install** — do not merge into product tree. Point `MINERU_API_URL` at `mineru-api` from this checkout or pip install |

## Recommended next steps

1. Smoke-test: `apps/web` + `services/api` + host `mineru-api`
2. Run `python -m start_translate.cli direct examples/MinerU.md` from `services/translate`
3. When satisfied, stop editing `D:\desktop\Translation`; optionally add a README there pointing here
4. Optional later: git submodule for MinerU, or only depend on PyPI `mineru`

Do **not** delete MinerU until models and `mineru-api` are reproducible from install/Docker alone.
