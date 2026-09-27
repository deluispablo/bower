# Writes the bird as standalone SVG files for the README and GitHub. Each one
# carries its CSS animation inside the SVG, so GitHub plays it in an <img>:
#
#   docs/assets/logo.svg            the mark, still
#   docs/assets/hero.svg            the bird looking around + the wordmark
#   docs/assets/why.svg             three panels: collects, arranges, shows off
#   docs/assets/how-it-works.svg    the tidy-up scene: inbox to nest
#   docs/assets/social-preview.svg  1280x640, navy, for the repo's social
#                                   preview (GitHub wants PNG: export this
#                                   file with any SVG tool and upload it)
#
# Text uses the system sans-serif: an SVG in an <img> cannot load a web
# font. Run: python3 docs/design/assets.py (imports gen.py, which
# regenerates the screens as a side effect).
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen  # noqa: E402

ASSETS = os.path.join(HERE, '..', 'assets')
SANS = "'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif"

# Only the rules the bird needs: colours, origins, poses and keyframes.
CSS = '\n'.join(line for line in gen.CSS.splitlines()
                if line.startswith(('.b', '.p-', '.e-', '.flip', '@keyframes')))
CSS = CSS.replace("font-family:Poppins,sans-serif", "font-family:%s" % SANS)
CSS += "\n@media (prefers-reduced-motion:reduce){.b *{animation:none!important}}"


def wrap(w, h, view, body, bg=None, label='Bower'):
    rect = '<rect width="100%%" height="100%%" fill="%s"/>' % bg if bg else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%d" height="%d" role="img" aria-label="%s">\n'
            '<style>%s</style>\n%s%s\n</svg>\n' % (view, w, h, label, CSS, rect, body))


def bird(pose, x, y, size, scene=False):
    # gen.bird() returns an <svg>; inside another SVG it needs x/y, not style.
    return re.sub(r'<svg class="b (.*?)" viewBox="0 0 100 100" width="\d+" height="\d+" aria-hidden="true" style="">',
                  r'<svg class="b \1" viewBox="0 0 100 100" x="%d" y="%d" width="%d" height="%d" overflow="visible">' % (x, y, size, size),
                  gen.bird(pose, size, scene=scene))


def text(x, y, s, size, fill, weight=400, anchor='start', spacing=0):
    return '<text x="%d" y="%d" font-family="%s" font-size="%d" font-weight="%d" fill="%s" text-anchor="%s" letter-spacing="%s">%s</text>' % (x, y, SANS, size, weight, fill, anchor, spacing, s)


def write(name, body):
    path = os.path.join(ASSETS, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(body)
    print('wrote', os.path.relpath(path, os.path.join(HERE, '..', '..')), len(body), 'bytes')


write('logo.svg', wrap(64, 64, '0 0 100 100', bird('', 0, 0, 100)))

hero = (bird('p-look', 20, 10, 180) +
        text(230, 118, 'Bower', 96, '#f1f5f9', 700, spacing=-3) +
        text(234, 158, 'A second brain that files itself.', 26, '#cbd5e1', 600))
write('hero.svg', wrap(640, 200, '0 0 640 200', hero, label='Bower, a second brain that files itself'))

panels = [('p-shiny', 'Collects', 'anything bright it finds', 'You drop files, links, photos, thoughts.', True),
          ('p-tidy', 'Arranges', 'every piece in its place', 'Tap Tidy up: title, tags, folder, links.', True),
          ('p-dance', 'Shows off', 'in front of the bower', 'Read it in the app or in Obsidian.', False)]
why = ''
for i, (pose, title, sub, app, scene) in enumerate(panels):
    x = i * 400
    why += ('<rect x="%d" y="0" width="380" height="300" rx="16" fill="#1a2538" stroke="#2c3a54"/>' % (x + 10)
            + bird(pose, x + 130, 40, 140, scene=scene)
            + text(x + 200, 218, title, 22, '#f1f5f9', 700, 'middle')
            + text(x + 200, 244, sub, 15, '#9fabbf', 400, 'middle')
            + text(x + 200, 276, app, 15, '#8fe0d2', 400, 'middle'))
write('why.svg', wrap(1200, 300, '0 0 1200 300', why, label='Why a bowerbird: it collects, arranges and shows off'))

how = ('<line x1="30" y1="126" x2="570" y2="126" stroke="#3b4a66" stroke-width="2" stroke-linecap="round"/>'
       + text(70, 152, 'Your inbox', 14, '#9fabbf')
       + text(420, 152, 'Cooking · Finance · Answers', 14, '#9fabbf')
       + bird('p-tidy', 230, 4, 124, scene=True))
write('how-it-works.svg', wrap(600, 160, '0 0 600 160', how, label='How it works: from your inbox to the right folder'))

# Local keyframes for the two README sections below: the filtered gen.CSS
# only keeps bird rules, so each gets its own small <style> in its body.
STEP_CSS = ('<style>.step{opacity:.15;animation:stepfade 8s ease-in-out infinite}'
            '@keyframes stepfade{0%,2%,98%,100%{opacity:.15}10%,18%{opacity:1}}'
            '@media (prefers-reduced-motion:reduce){.step{animation:none!important;opacity:1}}</style>')


def step(x, y, s, delay):
    return ('<text class="step" x="%d" y="%d" font-family="%s" font-size="14" fill="#8fe0d2" '
            'style="animation-delay:%.1fs">%s</text>' % (x, y, SANS, delay, s))


def panel(x, w, h, title):
    return ('<rect x="%d" y="0" width="%d" height="%d" rx="16" fill="#1a2538" stroke="#2c3a54"/>' % (x, w, h)
            + text(x + w // 2, 26, title, 17, '#f1f5f9', 700, 'middle'))


use_case = (
    STEP_CSS
    + panel(10, 280, 220, 'You save')
    + bird('p-shiny', 100, 34, 90)
    + text(150, 148, 'A link, a screenshot,', 12, '#9fabbf', 400, 'middle')
    + text(150, 164, 'a photo of a sign.', 12, '#9fabbf', 400, 'middle')
    + '<rect x="30" y="178" width="240" height="26" rx="8" fill="#233049"/>'
    + text(150, 195, 'rentradar.example · Camden · 2 bed', 11, '#8fe0d2', 400, 'middle')
    + panel(310, 280, 220, 'Bower works')
    + bird('p-tidy', 400, 30, 90, scene=True)
    + step(330, 168, 'reads', 0)
    + step(390, 168, 'files', 1.4)
    + step(330, 186, 'looks up', 2.8)
    + step(410, 186, 'writes', 4.2)
    + step(360, 204, 'remembers', 5.6)
    + panel(610, 280, 220, 'You get')
    + bird('p-dance', 700, 34, 80)
    + '<rect x="630" y="170" width="240" height="36" rx="8" fill="#233049"/>'
    + text(750, 184, '1-Projects / Flat hunt / Flat hunt.md', 10, '#9fabbf', 400, 'middle')
    + text(750, 199, 'Visit first: Camden', 13, '#f1f5f9', 700, 'middle')
)
write('use-case.svg', wrap(900, 240, '0 0 900 240', use_case,
                            label='Three acts: you save a flat listing, Bower works through reads, files, looks up, writes and remembers, you get a note that ranks your options'))

WIN_CSS = ('<style>.win-app{animation:winslide 9s ease-in-out infinite}'
           '@keyframes winslide{0%,30%{transform:translateX(0)}45%,80%{transform:translateX(-360px)}95%,100%{transform:translateX(0)}}'
           '@media (prefers-reduced-motion:reduce){.win-app{animation:none!important}}</style>')


def file_row(x, y, name, when):
    return (text(x, y, name, 13, '#dfe5ee') +
            text(x + 230, y, when, 12, '#7d8aa3', 400, 'end'))


def folder_card(x, label):
    return ('<rect x="%d" y="0" width="330" height="220" rx="16" fill="#1a2538" stroke="#2c3a54"/>' % x
            + text(x + 20, 30, label, 13, '#7d8aa3', 700)
            + file_row(x + 20, 70, 'Flat hunt.md', '4 min ago')
            + file_row(x + 20, 100, 'About me.md', '2 Aug')
            + file_row(x + 20, 130, 'CLAUDE.md', 'hidden')
            + '<line x1="%d" y1="150" x2="%d" y2="150" stroke="#2c3a54"/>' % (x + 20, x + 310))


window = (
    WIN_CSS
    + folder_card(340, 'Your Google Drive folder')
    + text(505, 236, 'Same files on both sides of the glass.', 13, '#9fabbf', 400, 'middle')
    + '<g class="win-app">'
    + folder_card(340, 'The app, on your phone or PC')
    + bird('p-look', 580, 30, 46)
    + '</g>'
)
write('window.svg', wrap(900, 250, '0 0 900 250', window,
                          label='The app view slides aside to show the same folder open in Google Drive'))

social = (bird('p-look', 150, 150, 340) +
          text(560, 300, 'Bower', 120, '#f1f5f9', 700, spacing=-3) +
          text(564, 368, 'A second brain that files itself.', 38, '#9fabbf') +
          text(564, 420, 'Your Google Drive · a Claude agent · 0 € a month', 30, '#8fe0d2'))
write('social-preview.svg', wrap(1280, 640, '0 0 1280 640', social, bg='#111a2b'))

for old in ('bird-hero.svg', 'bird-tidy.svg'):
    p = os.path.join(ASSETS, old)
    if os.path.exists(p):
        os.remove(p)
        print('removed', old)

# The static PNG logo for Google's consent screen and the stores, rendered
# from app/public/logo.svg (already square, transparent, teal on nothing).
# Needs a headless browser: only runs inside the throwaway venv described
# in docs/design/README.md (playwright + Pillow). A plain
# `python3 docs/design/assets.py` skips this and still writes every SVG
# above with no extra packages.
def render_logo_pngs():
    try:
        from PIL import Image
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('skipped logo PNGs: no playwright/Pillow (see docs/design/README.md)')
        return

    logo_path = os.path.join(HERE, '..', '..', 'app', 'public', 'logo.svg')
    with open(logo_path, encoding='utf-8') as f:
        svg = f.read()
    # A white silhouette for dark backgrounds: same shapes, every fill and
    # stroke white (the legs are drawn as amber strokes, not fills).
    white = re.sub(r'(?:fill|stroke)="#[0-9a-fA-F]{3,6}"', lambda m: m.group(0).split('=')[0] + '="#ffffff"', svg)
    white = re.sub(r'fill-opacity="\.\d+"\s*', '', white)

    jobs = [('logo-512.png', svg, 512), ('logo-120.png', svg, 120), ('logo-120-white.png', white, 120)]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for name, markup, size in jobs:
            sized = markup.replace('<svg ', '<svg width="%d" height="%d" ' % (size, size), 1)
            page.set_viewport_size({'width': size, 'height': size})
            page.set_content('<!doctype html><html><body style="margin:0">%s</body></html>' % sized)
            out = os.path.join(ASSETS, name)
            page.locator('svg').screenshot(path=out, omit_background=True)
            with Image.open(out) as im:
                assert im.size == (size, size), '%s is not %dx%d: %r' % (name, size, size, im.size)
            n = os.path.getsize(out)
            assert n < 1024 * 1024, '%s is %d bytes, over 1 MB' % (name, n)
            print('wrote', os.path.relpath(out, os.path.join(HERE, '..', '..')), n, 'bytes')
        browser.close()


render_logo_pngs()
