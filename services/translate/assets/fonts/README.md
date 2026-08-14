# Fonts

| File | Role |
| --- | --- |
| `TIMES.TTF` | English body (Times New Roman) |
| `SIMSUN.TTF` | Chinese body fallback for PDF embedding |
| `SIMSUN.TTC` | Source collection backup |

PDF export follows the Translation approach on Windows:

1. Stage project TTFs next to the HTML (`.start_fonts/`)
2. `@font-face` for PaperSong prefers `local("SimSun")` / `local("宋体")` first
   so Chromium embeds the real system Songti (Edge-safe)
3. Project `SIMSUN.TTF` is only the fallback when system SimSun is missing

Preferring the project TTF URL over `local("SimSun")` often looks fine in
Chrome/mobile (viewer font substitution) but shows **black boxes for Chinese
in Edge**.

If `SIMSUN.TTF` is missing, run from repo root:

```powershell
python scripts/extract_simsun.py
```
