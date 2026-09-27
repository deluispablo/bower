#!/usr/bin/env python3
"""Generate the Bower logo, wordmarks, favicons and PWA icons.

Writes app/public/logo*.svg, app/public/icons/* and docs/assets/logo.svg. The bird is
defined once below on a 100 x 100 grid (the drawing of docs/design/gen.py, BIRD_CORE,
without its props); every output places it by its measured bounding box, so it is
centred in each icon. After rendering, the script checks centring, the maskable safe
zone, how much of the 16 px favicon the bird fills and the size of logo.svg, and exits
non-zero if any check fails.

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

DOCS_LOGO = ROOT / "docs/assets/logo.svg"

TEAL, TEAL_DARK, CHEEK, NAVY, AMBER, AMBER_DARK, WHITE, INK_DARK = (
    "#2dd4bf", "#0f766e", "#99f6e4", "#0b1220", "#fbbf24", "#d97706", "#ffffff", "#f1f5f9")

# The bird on a 100 x 100 grid, facing right, feet on y = 91: cocked tail, feet, round
# body, leaf wing, round head with cheek, eye with two highlights, beak and jaw. Same
# paths as BIRD_CORE in docs/design/gen.py (and the app's components/bird.tsx), without
# the props it only holds while a state shows them.
GRID = 100
FEET = f'fill="none" stroke="{AMBER_DARK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
BIRD = [
    f'<path fill="{TEAL_DARK}" d="M29 56C21 47 14 40 6 35C11 43 18 52 31 62Z"/>',
    f'<path {FEET} d="M40 84L39 91M35 91h8"/>',
    f'<path {FEET} d="M53 85L53 91M49 91h8"/>',
    f'<circle fill="{TEAL}" cx="46" cy="62" r="24"/>',
    f'<path fill="{TEAL_DARK}" d="M44 50C57 49 65 59 60 72C49 72 39 64 44 50Z"/>',
    f'<circle fill="{TEAL}" cx="62" cy="40" r="19"/>',
    f'<circle fill="{CHEEK}" fill-opacity=".8" cx="72" cy="46" r="3.2"/>',
    f'<circle fill="{NAVY}" cx="68" cy="37" r="5.2"/>',
    f'<circle fill="{WHITE}" cx="70" cy="35" r="1.9"/>',
    f'<circle fill="{WHITE}" cx="66.4" cy="39.2" r=".9"/>',
    f'<path fill="{AMBER}" d="M80 38L92 42L80 45Z"/>',
    f'<path fill="{AMBER_DARK}" d="M80 43.5L90 42.5L80 47.5Z"/>',
]

# At 16 px the bird's longer side must cover at least this many pixels of the favicon.
FAVICON_16_MIN_SPAN = 12

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
        img = render(browser, svg(f"0 0 {GRID} {GRID}", bird()), GRID * scale)
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


def write(path: Path, text: str) -> None:
    """Writes with LF line endings on every platform, as the repository stores them."""
    path.write_text(text, encoding="utf-8", newline="\n")


def mark_bbox(img: Image.Image, bg: tuple[int, int, int] | None,
              alpha_min: int = 8) -> tuple[int, int, int, int]:
    """Bounding box of pixels that are neither transparent (alpha up to `alpha_min`) nor the
    background colour."""
    px = img.load()
    xs, ys = [], []
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a > alpha_min and (bg is None or abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 24):
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

        # Mark only, transparent, centred on the grid; docs/assets/logo.svg is the same file.
        logo = svg(f"0 0 {GRID} {GRID}", g.placed(GRID, 1), label=True)
        write(PUBLIC / "logo.svg", logo)
        write(DOCS_LOGO, logo)

        # Wordmarks: bird flush left, word outlined, caps centred on the bird's vertical
        # centre. Word size, gap and tracking scale with the bird's height.
        pad = GRID / 64
        size = 0.91 * g.h
        gap = 0.19 * g.h
        tracking = -0.4 * size / 38
        d, end, cap = word_path("Bower", size, g.w + gap, 0, tracking)
        baseline = g.h / 2 + cap / 2
        d, end, cap = word_path("Bower", size, g.w + gap, baseline, tracking)
        body = f'<g transform="translate({-g.x0:.4g} {-g.y0:.4g})">\n    {bird()}\n  </g>'
        box = f"{-pad:.4g} {-pad:.4g} {end + 2 * pad:.4g} {g.h + 2 * pad:.4g}"
        for name, colour in (("logo-wordmark.svg", NAVY), ("logo-wordmark-dark.svg", INK_DARK)):
            write(PUBLIC / name, svg(box, body, f'<path fill="{colour}" d="{d}"/>', label=True))

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
        write(ICONS / "favicon.svg", favicon)

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
        # Opaque pixels only: the rounded corners' faint edge is not the bird.
        x0, y0, x1, y1 = mark_bbox(frames[0], navy_rgb, alpha_min=128)
        span = max(x1 - x0, y1 - y0)
        print(f"favicon 16 px: bird spans {span} px")
        if span < FAVICON_16_MIN_SPAN:
            failures.append(f"favicon at 16 px: the bird spans {span} px, under {FAVICON_16_MIN_SPAN}")
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
