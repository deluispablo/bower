#!/usr/bin/env python3
"""Check WCAG 2.1 contrast of the colour tokens in app/src/styles/tokens.css.

Reads the light tokens from the first `:root` block and the dark overrides from the
`:root[data-theme='dark']` block, then checks each text/background pair against AA
(4.5:1 for text, 3:1 for control outlines). Prints a table and exits non-zero on failure.
Standard library only.

usage: python3 scripts/brand/contrast.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

TOKENS = Path(__file__).resolve().parents[2] / "app/src/styles/tokens.css"

# (foreground, background, minimum ratio)
PAIRS = [
    ("text", "bg", 4.5), ("text", "surface", 4.5), ("text", "sidebar", 4.5),
    ("text-muted", "bg", 4.5), ("text-muted", "surface", 4.5),
    ("text-muted", "sidebar", 4.5),
    ("link", "bg", 4.5), ("link", "surface", 4.5),
    ("danger", "bg", 4.5), ("success", "bg", 4.5),
    ("on-brand", "brand", 4.5), ("on-accent", "accent", 4.5),
    ("border-strong", "bg", 3.0), ("border-strong", "surface", 3.0),
]


def luminance(hex_colour: str) -> float:
    h = hex_colour.lstrip("#")
    channels = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def ratio(a: str, b: str) -> float:
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def block(css: str, selector: str) -> dict[str, str]:
    match = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, re.S)
    if not match:
        sys.exit(f"selector not found in tokens.css: {selector}")
    return dict(re.findall(r"--([\w-]+):\s*([^;]+);", match.group(1)))


def resolve(tokens: dict[str, str], name: str) -> str:
    value = tokens[f"color-{name}"].strip()
    while value.startswith("var("):
        value = tokens[value[6:-1]].strip()
    return value


def main() -> None:
    css = re.sub(r"/\*.*?\*/", "", TOKENS.read_text(), flags=re.S)
    light = block(css, ":root")
    themes = {"light": light, "dark": {**light, **block(css, ":root[data-theme='dark']")}}
    failed = False
    print(f"{'pair':32} {'light':>7} {'dark':>7}")
    for fg, bg, need in PAIRS:
        cells = []
        for tokens in themes.values():
            r = ratio(resolve(tokens, fg), resolve(tokens, bg))
            failed |= r < need
            cells.append(f"{r:6.2f}{'' if r >= need else '!'}")
        print(f"{fg + ' on ' + bg + f' (>= {need:g})':32} {cells[0]:>7} {cells[1]:>7}")
    if failed:
        sys.exit("FAILED: pairs marked ! are below WCAG AA")
    print("ok")


if __name__ == "__main__":
    main()
