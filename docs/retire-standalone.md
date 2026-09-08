# Retire standalone folders

After this monorepo works end-to-end:

| Old layout | Action |
|------------|--------|
| Flat Vite app (legacy KingStar root) | Absorbed into `apps/web` |
| Standalone Translation repo | Absorbed into `services/translate` — keep old folder as backup until you verify CLI parity, then archive/delete |
| MinerU checkout | **Keep as engine source / local install** — do not merge into product tree. Point `MINERU_API_URL` at `mineru-api` from that checkout or pip install |

Suggested order:

1. Run web + BFF + MinerU against monorepo daily
2. Compare `python -m start_translate.cli` with your previous Translation CLI on the same Markdown fixture
3. When satisfied, stop editing the old Translation tree; optionally add a README there pointing here

Do **not** delete MinerU until models and `mineru-api` are reproducible from install/Docker alone.
