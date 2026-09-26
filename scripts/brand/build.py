#!/usr/bin/env python3
"""Generate the Bower logo, wordmarks, favicons and PWA icons.

Writes app/public/logo*.svg and app/public/icons/*. The bird is defined once below on a
64 x 64 grid; every output places it by its measured bounding box, so it is centred in
each icon. After rendering, the script checks centring and the maskable safe zone and
exits non-zero if either fails.

Requirements (developer machine only, not app dependencies): Python 3.10+, Pillow,
fontTools, Playwright for Python with Chromium (`python3 -m playwright install chromium`),
and Poppins Bold (SIL OFL 1.1) for the wordmark outlines. Point BOWER_WORDMARK_FONT at the
.ttf if it is not in a standard location.

usage: python3 scripts/brand/build.py
"""
from __future__ import annotations

import base64
import io
import os
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image
from playwright.sync_api import Browser, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "app/public"
ICONS = PUBLIC / "icons"

TEAL, TEAL_DARK, NAVY, AMBER, INK_DARK = "#2dd4bf", "#0f766e", "#0b1220", "#fbbf24", "#f1f5f9"

# The bird on a 64 x 64 grid, facing right: body with a cocked tail, wing, eye, beak, twig.
BIRD = [
    f'<path fill="{TEAL}" d="M51.6 18A10 10 0 0 0 32.4 18C31.5 22.5 28 25.5 23 27.5L10.5 21.5Q6.5 20 6.5 24'
    f'L7.5 27Q10.5 31 15.5 33.5C14.5 44.5 22.5 52 34 52C45 52 51.5 45.5 52 37.5C52.3 33 51.3 29.5 50 27.5'
    f'L51.4 24.4Z"/>',
    f'<path fill="{TEAL_DARK}" d="M44 35C41 29.5 30 28.5 18.5 32.5C25 41 37 42 44 35Z"/>',
    f'<circle fill="{NAVY}" cx="45" cy="19.5" r="2.4"/>',
    f'<path fill="{AMBER}" d="M51 16.5L60.5 21L51 24.5Z"/>',
    f'<path fill="none" stroke="{AMBER}" stroke-width="2.4" stroke-linecap="round" '
    f'd="M54.4 28.5L59.4 11.5M57.8 17L61.9 14.7"/>',
]

FONT_CANDIDATES = [
    os.environ.get("BOWER_WORDMARK_FONT", ""),
    "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf",
    str(Path.home() / ".fonts/Poppins-Bold.ttf"),
    str(Path.home() / ".local/share/fonts/Poppins-Bold.ttf"),
    str(Path.home() / "Library/Fonts/Poppins-Bold.ttf"),
    "/Library/Fonts/Poppins-Bold.ttf",
    "C:/Windows/Fonts/Poppins-Bold.ttf",
]


def bird(indent: str = "    ") -> str:
    return ("\n" + indent).join(BIRD)


def svg(view_box: str, *body: str, label: bool = False) -> str:
    aria = ' role="img" aria-label="Bower"' if label else ""
    inner = "\n  ".join(body)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view_box}"{aria}>\n  {inner}\n</svg>\n'


def uri(markup: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(markup.encode()).decode()


def render(browser: Browser, markup: str, px: int, transparent: bool = True) -> Image.Image:
    page = browser.new_page(viewport={"width": px, "height": px})
    page.set_content(f"<body style='margin:0'><img src='{uri(markup)}' width='{px}' height='{px}' "
                     "style='display:block'></body>")
    page.wait_for_function("document.images[0].complete")
    png = page.screenshot(omit_background=transparent)
    page.close()
    return Image.open(io.BytesIO(png)).convert("RGBA")


class Geometry:
    """Bounding box and farthest-pixel radius of the bird, in grid units, measured from a render."""

    def __init__(self, browser: Browser) -> None:
        scale = 16
        img = render(browser, svg("0 0 64 64", bird()), 64 * scale)
        x0, y0, x1, y1 = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        self.x0, self.y0, self.x1, self.y1 = x0 / scale, y0 / scale, x1 / scale, y1 / scale
        self.cx, self.cy = (self.x0 + self.x1) / 2, (self.y0 + self.y1) / 2
        self.w, self.h = self.x1 - self.x0, self.y1 - self.y0
        alpha = img.getchannel("A").load()
        r2 = 0.0
        for y in range(img.height):
            for x in range(img.width):
                if alpha[x, y] > 8:
                    r2 = max(r2, ((x + 0.5) / scale - self.cx) ** 2 + ((y + 0.5) / scale - self.cy) ** 2)
        self.radius = r2 ** 0.5

    def placed(self, size: float, k: float) -> str:
        """The bird scaled by k with its bounding box centred on a size x size canvas."""
        tx, ty = size / 2 - self.cx * k, size / 2 - self.cy * k
        scale = "" if k == 1 else f" scale({k:.4g})"
        return f'<g transform="translate({tx:.4g} {ty:.4g}){scale}">\n    {bird()}\n  </g>'


def fmt(n: float) -> str:
    s = f"{n:.1f}".rstrip("0").rstrip(".")
    return "0" if s == "-0" else s


def word_path(text: str, size: float, x0: float, baseline: float, tracking: float) -> tuple[str, float, float]:
    """Outline `text` as one SVG path. Returns (d, end x, cap height)."""
    font_path = next((p for p in FONT_CANDIDATES if p and Path(p).is_file()), None)
    if font_path is None:
        sys.exit("Poppins-Bold.ttf not found; set BOWER_WORDMARK_FONT to its path.")
    font = TTFont(font_path)
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    k = size / font["head"].unitsPerEm
    parts, x = [], x0
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyphs, ntos=fmt)
        glyphs[name].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
        parts.append(pen.getCommands())
        x += glyphs[name].width * k + tracking
    return "".join(parts), x - tracking, font["OS/2"].sCapHeight * k


def mark_bbox(img: Image.Image, bg: tuple[int, int, int] | None) -> tuple[int, int, int, int]:
    """Bounding box of pixels that are neither transparent nor the background colour."""
    px = img.load()
    xs, ys = [], []
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > 8 and (bg is None or abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 24):
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    navy_rgb = tuple(int(NAVY[i:i + 2], 16) for i in (1, 3, 5))
    failures: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        g = Geometry(browser)
        print(f"bird bbox x {g.x0:.2f}..{g.x1:.2f} y {g.y0:.2f}..{g.y1:.2f}, radius {g.radius:.2f}")

        # Mark only, transparent, centred on the 64 grid.
        (PUBLIC / "logo.svg").write_text(svg("0 0 64 64", g.placed(64, 1), label=True))

        # Wordmarks: bird flush left, word outlined, caps centred on the bird's vertical centre.
        pad = 1.0
        size = 38
        d, end, cap = word_path("Bower", size, g.w + 8, 0, -0.4)
        baseline = g.h / 2 + cap / 2
        d, end, cap = word_path("Bower", size, g.w + 8, baseline, -0.4)
        body = f'<g transform="translate({-g.x0:.4g} {-g.y0:.4g})">\n    {bird()}\n  </g>'
        box = f"{-pad:g} {-pad:g} {end + 2 * pad:.4g} {g.h + 2 * pad:.4g}"
        for name, colour in (("logo-wordmark.svg", NAVY), ("logo-wordmark-dark.svg", INK_DARK)):
            (PUBLIC / name).write_text(svg(box, body, f'<path fill="{colour}" d="{d}"/>', label=True))

        # Icons on a 512 grid.
        rounded = f'<rect width="512" height="512" rx="112" fill="{NAVY}"/>'
        square = f'<rect width="512" height="512" fill="{NAVY}"/>'
        side = max(g.w, g.h)
        k_mask = 0.38 * 512 / g.radius  # farthest bird pixel at 38 % of the size; safe zone is 40 %
        icons = {
            "icon-192.png": (svg("0 0 512 512", rounded, g.placed(512, 0.70 * 512 / side)), 192, True),
            "icon-512.png": (svg("0 0 512 512", rounded, g.placed(512, 0.70 * 512 / side)), 512, True),
            "maskable-512.png": (svg("0 0 512 512", square, g.placed(512, k_mask)), 512, False),
            "apple-touch-icon.png": (svg("0 0 512 512", square, g.placed(512, 0.66 * 512 / side)), 180, False),
        }
        favicon = svg("0 0 64 64", f'<rect width="64" height="64" rx="14" fill="{NAVY}"/>',
                      g.placed(64, 0.84 * 64 / side))
        (ICONS / "favicon.svg").write_text(favicon)

        for name, (markup, px, transparent) in icons.items():
            img = render(browser, markup, px, transparent)
            x0, y0, x1, y1 = mark_bbox(img, navy_rgb)
            off = max(abs((x0 + x1) / 2 - px / 2), abs((y0 + y1) / 2 - px / 2))
            print(f"{name}: bird bbox centre off by {off:.1f} px")
            if off > max(1.5, px / 128):
                failures.append(f"{name} is off-centre by {off:.1f} px")
            if name == "maskable-512.png":
                pix = img.load()
                far = max(
                    ((x + 0.5 - px / 2) ** 2 + (y + 0.5 - px / 2) ** 2) ** 0.5
                    for y in range(px) for x in range(px)
                    if sum(abs(pix[x, y][i] - navy_rgb[i]) for i in range(3)) > 24
                )
                print(f"{name}: farthest bird pixel {far:.1f} px from centre, safe radius {0.4 * px:.1f} px")
                if far > 0.4 * px:
                    failures.append(f"{name} leaves the safe zone ({far:.1f} > {0.4 * px:.1f})")
            if not transparent:
                img = img.convert("RGB")
            img.save(ICONS / name, optimize=True)

        frames = [render(browser, favicon, px) for px in (16, 32, 48)]
        frames[2].save(ICONS / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)],
                       append_images=frames[:2])
        browser.close()

    size_kb = (PUBLIC / "logo.svg").stat().st_size / 1024
    print(f"logo.svg: {size_kb:.2f} KB")
    if size_kb >= 6:
        failures.append("logo.svg is 6 KB or more")
    if failures:
        sys.exit("FAILED: " + "; ".join(failures))
    print("ok")


if __name__ == "__main__":
    main()
