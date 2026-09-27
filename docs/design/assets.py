# Writes the bird as standalone SVG files for the README and GitHub:
#
#   docs/assets/logo.svg            the mark, still
#   docs/assets/bird-hero.svg       the bird looking around (CSS animation
#                                   inside the SVG; GitHub plays it in <img>)
#   docs/assets/bird-tidy.svg       the tidy-up scene: inbox to nest
#   docs/assets/social-preview.svg  1280x640, navy, for the repo's social
#                                   preview (GitHub wants PNG: export this
#                                   file with any SVG tool and upload it)
#
# Run: python3 docs/design/assets.py   (imports gen.py, which regenerates
# the screens as a side effect).
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gen  # noqa: E402

ASSETS = os.path.join(HERE, '..', 'assets')

# Only the rules the bird needs: colours, origins, poses and keyframes.
CSS = '\n'.join(line for line in gen.CSS.splitlines()
                if line.startswith(('.b', '.p-', '.e-', '.flip', '@keyframes')))
CSS = CSS.replace("font-family:Poppins,sans-serif", "font-family:Poppins,'Segoe UI',system-ui,sans-serif")


def wrap(w, h, view, body, bg=None):
    rect = '<rect width="100%%" height="100%%" fill="%s"/>' % bg if bg else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%d" height="%d" role="img" aria-label="Bower">\n'
            '<style>%s</style>\n%s%s\n</svg>\n' % (view, w, h, CSS, rect, body))


def bird(pose, x, y, size, scene=False):
    # gen.bird() returns an <svg>; inside another SVG it needs x/y, not style.
    return re.sub(r'<svg class="b (.*?)" viewBox="0 0 100 100" width="\d+" height="\d+" aria-hidden="true" style="">',
                  r'<svg class="b \1" viewBox="0 0 100 100" x="%d" y="%d" width="%d" height="%d" overflow="visible">' % (x, y, size, size),
                  gen.bird(pose, size, scene=scene))


def write(name, text):
    path = os.path.join(ASSETS, name)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote', os.path.relpath(path, os.path.join(HERE, '..', '..')), len(text), 'bytes')


write('logo.svg', wrap(64, 64, '0 0 100 100', bird('', 0, 0, 100)))

write('bird-hero.svg', wrap(240, 240, '0 0 100 100', bird('p-look', 0, 0, 100)))

tidy = ('<line x1="24" y1="126" x2="376" y2="126" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>'
        '<text x="52" y="150" font-family="Poppins,\'Segoe UI\',system-ui,sans-serif" font-size="13" fill="#94a3b8">Inbox</text>'
        '<text x="288" y="150" font-family="Poppins,\'Segoe UI\',system-ui,sans-serif" font-size="13" fill="#94a3b8">Cooking · Finance</text>'
        + bird('p-tidy', 140, 8, 120, scene=True))
write('bird-tidy.svg', wrap(400, 160, '0 0 400 160', tidy))

social = (bird('p-look', 150, 150, 340) +
          '<text x="560" y="300" font-family="Poppins,\'Segoe UI\',system-ui,sans-serif" font-weight="700" font-size="120" fill="#f1f5f9" letter-spacing="-3">Bower</text>'
          '<text x="564" y="368" font-family="\'Source Sans 3\',\'Segoe UI\',system-ui,sans-serif" font-size="38" fill="#94a3b8">A second brain that files itself.</text>'
          '<text x="564" y="420" font-family="\'Source Sans 3\',\'Segoe UI\',system-ui,sans-serif" font-size="30" fill="#5eead4">Your Google Drive · a Claude agent · 0 € a month</text>')
write('social-preview.svg', wrap(1280, 640, '0 0 1280 640', social, bg='#0b1220'))
