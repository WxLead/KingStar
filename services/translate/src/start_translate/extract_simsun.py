"""Extract a TTF face from SIMSUN.TTC for Chromium PDF embedding."""

from pathlib import Path

from fontTools.ttLib import TTCollection

ROOT = Path(__file__).resolve().parents[2]
TTC = ROOT / "assets" / "fonts" / "SIMSUN.TTC"
OUT = ROOT / "assets" / "fonts" / "SIMSUN.TTF"


def main() -> None:
    ttc = TTCollection(str(TTC))
    print(f"faces: {len(ttc.fonts)}")
    chosen = 0
    for i, font in enumerate(ttc.fonts):
        label = ""
        for rec in font["name"].names:
            if rec.nameID == 4:
                try:
                    label = rec.toUnicode()
                    break
                except Exception:
                    pass
        print(f"  [{i}] {label}")
        # Prefer exact "SimSun" over "NSimSun".
        if label.replace(" ", "").lower() == "simsun":
            chosen = i
    ttc.fonts[chosen].save(str(OUT))
    print(f"wrote face {chosen} -> {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
