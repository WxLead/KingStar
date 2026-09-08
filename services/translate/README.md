# services/translate

KingStar translation package (migrated from standalone `Translation/`).

## Install

```powershell
cd services/translate
pip install -e .
# optional: playwright install chromium
copy .env.example .env
```

## CLI

```powershell
python -m start_translate.cli direct examples/MinerU.md
python -m start_translate.cli beautify examples/MinerU.md
python run.py direct examples/MinerU.md
```

Outputs default to `outputs/<stem>/`.

## Library (for BFF)

```python
from start_translate import translate_markdown, export_pdf, beautify_and_export, run_direct

translate_markdown("en.md", "out/zh.md")
export_pdf("out/zh.md", "out/zh.pdf")
```

## Layout

```text
services/translate/
├── src/start_translate/   # package
├── assets/fonts/
├── examples/
├── config.yaml
├── .env.example
└── run.py                 # thin CLI wrapper
```
