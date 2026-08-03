#!/usr/bin/env python3
"""Thin wrapper: python run.py ...  ==  python -m start_translate.cli ..."""

from start_translate.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
