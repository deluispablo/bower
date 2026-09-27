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
