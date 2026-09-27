# Brand

Bower is named after the bowerbird, which builds and decorates a bower from twigs and bright finds. The mark is that bird: flat, friendly, side view. The same drawing is the app's mascot, animated on every screen. The CSS tokens that implement this page live in `app/src/styles/tokens.css`; change both together.

## Mark and files

One drawing (v8.2, approved 2026-09-28; spec §4.1) on a 100 × 100 grid, facing right, feet on y = 91: a round teal body (`#5fcfbc`) with a lighter belly (`#b9ece2`); a round head on a same-colour neck; one big navy eye (`#1b2233`) with two white highlights and a faint lighter cheek; an upper and a lower eyelid in head colour; a pill-shaped amber beak (`#f0b64f`) with a darker jaw (`#d9952e`); one long leaf-shaped dark-teal wing (`#2f9c8d`) lying along the flank, hinged at the shoulder; three thin dark-teal tail feathers fanning back and up from the rump; two amber stick legs with flat pill feet. No gradients, no outlines, no raster. It holds a twig, paper or gem only while carrying one, so the mark has none. The lockups, icon sizes, one-colour version and clear space are drawn in `docs/design/screens/Logo.dc.html`.

| File | Use |
| --- | --- |
| `app/public/logo.svg` | Mark only, transparent. Avatars, sign-in page. The in-app header draws the animated bird instead (`<Bird state="looking">`). |
| `docs/assets/logo.svg` | The mark for the README and GitHub, written by `docs/design/assets.py` with the other README drawings (not by `build.py`). |
| `app/public/logo-wordmark.svg` | Mark + "Bower" with a navy word, for light backgrounds. The word is outlined from Poppins Bold (SIL Open Font License 1.1) with letter-spacing -3 %, sized and spaced as the primary lockup of `Logo.dc.html` (84 px bird box, 14 px gap, 52 px word), so no font is loaded. |
| `app/public/logo-wordmark-dark.svg` | The same with a `#f1f5f9` word, for dark backgrounds. Pick the file by the page's theme (for example `<picture>` with a `prefers-color-scheme` source, or the app's current theme); neither file switches colour on its own. |
| `app/public/icons/favicon.svg` | Browser tab. Mark on a navy rounded square so it reads on light and dark tab bars. |
| `app/public/icons/favicon.ico` | Legacy favicon, 16, 32 and 48 px. |
| `app/public/icons/icon-192.png`, `icon-512.png` | PWA icons (`purpose: any`): navy rounded square, transparent corners. |
| `app/public/icons/maskable-512.png` | PWA icon (`purpose: maskable`): full-bleed navy; the whole bird sits inside the central circle of radius 40 % (the safe zone). |
| `app/public/icons/apple-touch-icon.png` | 180 × 180, full-bleed navy, no transparency (iOS rounds the corners itself). |

In every icon the bird's bounding box is centred on the canvas. Clear space around the mark: at least a quarter of its height. Minimum size: 16 px for the mark on navy, 24 px for the bare mark, 96 px wide for the wordmark.

### The bird in the app

`<Bird>` (`app/src/components/bird.tsx`, styles in `app/src/styles/bird.css`) draws the mark with every part in its own group, so each state is CSS on the same markup: no JavaScript timer, no image request. Every bird is `aria-hidden`; the text next to it carries the meaning.

| Group | Origin | Moves |
| --- | --- | --- |
| `rig` | feet | breathe, hop, squash on landing, strut, fly |
| `turn` | feet | faces left or right (`scaleX(-1)`) |
| `hd` head (neck, eye, lids, cheek, beak) | base of the neck, 60 64 | turns, stretches up, leans, tucks |
| `ey` eye | centre | blink, wink, dilate, look left or right |
| `ld`, `lb` upper and lower lid | centre | upper comes down (worried, sleepy, asleep, offline, confused), lower comes up (happy, proud and the lively states) |
| `jw` jaw | hinge | chirp, sing |
| `wg` wing | shoulder, 54 57 | flap, flutter, spread, shrug, shelter, cheer |
| `tl` tail (three feathers) | rump, 30 76 | flick, wag, fan, settle, stream in flight |
| `ft` legs and feet | under the belly, 47 84 | tuck in flight, crouch, step, fold in the nest |

Joints pivot in drawing units (`transform-box: view-box`, the numbers above are grid units), so no rotation can detach a part.

Props (twig `tw`, paper `pp`, notes `nt`, question mark `qm`, z `zz`, sparkles `sp`, cloud `cl` and rain `rn`, scan dots `dd`, the "!" `ex`) are separate elements, hidden unless a state shows them. `scene` adds the inbox tray and the nest (`tray`, `nest`) of Tidying up, the twig pile and the growing nest (`bp`, `bn`) of Building, the sleeping nest (`nest2`) of Asleep and the gem of Shiny.

| State | Where | Motion | Plays |
| --- | --- | --- | --- |
| Looking | Every idle bird: header, explorer footer, greeting | Breath, blink, head turns up, down, back; whole bird turns round every 11 s; tail flick | Loop |
| Hello | Sign-in, first open of the day, end of the tour | Flies in flapping with feet tucked, lands with a squash, tail settles, looks at you, two chirps, one hop | Once |
| Shiny | Search box on focus, a file over the drop zone, a link pasted | Eye grows, leans in, wing flutters, tail wags, two bounces | Loop while focused |
| Singing | Tell Bower while typing and right after send | Head up, jaw keeps the beat, three notes float off, tail wags | Loop while typing |
| Tidying up | Button and sheet during a run | Ferries a paper then a twig from inbox to nest; the nest fills, folder names appear | Loop until the run ends |
| Show-off | Run finished, tour finished, first note ever filed | Strut, deep bow, wing spread, tail fanned, sparkles | Once, then Looking |
| Confused | Run failed, note not found, not invited, 404 | Head tilts both ways, wing shrug, question mark | Slow loop |
| Building | Folder creation on first run, long first loads | Twig in beak, hops between two walls of twigs that go up stick by stick | Loop until done |
| Asleep | Empty inbox, nothing sent yet | Head tucked, eye shut, slow breath, two z | Loop |
| Peeking | Behind the drop zone; behind the search box before typing | Only the top of the head shows, eye follows the caret, head pops up | Loop |
| Offline | Offline banner, note not on this device | Puffed, desaturated, cloud above, slow blink | Still |
| Done | Small wins: upload done, message sent, settings saved | One hop, wink, chirp | Once, 2 s |

Five still faces from the same dials (lids, jaw, eye, head): happy (lower lid up, jaw open, head up), curious (eye wide, lean in), worried (upper lid down, head down), sleepy (both lids closed, head tucked), proud (lower lid up, head up, wing and tail spread) (`face` prop). Plays-once states call `onDone` when the `rig`'s animation ends (right away with reduced motion); the caller switches back to Looking. Under `prefers-reduced-motion: reduce` (or `reducedMotion`) no state plays: the bird holds the still face of its state (Hello happy, Shiny curious, Confused worried, Asleep sleepy, Show-off proud, otherwise none).

### Regenerating

The shapes come from the design canvas (`docs/design/gen.py`, `BIRD_CORE` and `SCENE`); the app's component (`app/src/components/bird.tsx`, with `styles/bird.css` from the canvas's `CSS`) and `scripts/brand/build.py` each carry a copy, so change all three together. Then run `python3 scripts/brand/build.py`. It rewrites every file above except `docs/assets/logo.svg` (run `python3 docs/design/assets.py` for that one), centres the bird by its measured bounding box, and fails if an icon is off-centre, the maskable bird leaves the safe zone, the bird fills less than 12 px of the 16 px favicon or `logo.svg` reaches 6 KB. It needs Pillow, fontTools, Playwright with Chromium and Poppins Bold on the developer machine (a system `Poppins-Bold.ttf`, else the app's own `poppins-700.woff2` with brotli installed; see the script header); none of these are app dependencies. After changing colours in `tokens.css`, run `python3 scripts/brand/contrast.py` (standard library only) and update the contrast table below.

## Palette

Brand colours: teal `#2dd4bf`, deep navy `#0b1220`, amber `#fbbf24`. Neutrals are from the slate scale. Teal and amber are fills; they are never text colours on a light background (teal on white is 1.86:1).

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--color-sidebar` | Explorer, bottom nav, drawer | `#f5f7fa` | `#070c16` |
| `--color-bg` | Page background | `#ffffff` | `#0b1220` |
| `--color-surface` | Cards, sheets, inputs | `#f1f5f9` | `#162033` |
| `--color-surface-hover` | Hover, active rows | `#e8edf3` | `#1c2942` |
| `--color-text` | Body text | `#0b1220` | `#e6ebf2` |
| `--color-heading` | Headings | `#0b1220` | `#f1f5f9` |
| `--color-text-muted` | Secondary text, captions | `#475569` | `#94a3b8` |
| `--color-brand-tint` | Selection, callouts, tag pills | `rgb(45 212 191 / .16)` | `rgb(45 212 191 / .16)` |
| `--color-link` | Links, text buttons | `#0f766e` | `#2dd4bf` |
| `--color-brand` | Primary button fill, highlights | `#2dd4bf` | `#2dd4bf` |
| `--color-on-brand` | Text on `--color-brand` | `#0b1220` | `#0b1220` |
| `--color-accent` | Badges, the "new" dot, the twig | `#fbbf24` | `#fbbf24` |
| `--color-on-accent` | Text on `--color-accent` | `#0b1220` | `#0b1220` |
| `--color-border` | Dividers (decorative) | `#e2e8f0` | `#263349` |
| `--color-border-strong` | Input and control outlines | `#64748b` | `#64748b` |
| `--color-focus` | Focus ring | `#0f766e` | `#2dd4bf` |
| `--color-danger` | Errors | `#b91c1c` | `#f87171` |
| `--color-on-danger` | Text on a `--color-danger` fill (e.g. the danger button) | `#ffffff` | `#0b1220` |
| `--color-success` | Confirmations | `#15803d` | `#4ade80` |
| `--color-on-success` | Text on a `--color-success` fill (e.g. the "done" button) | `#ffffff` | `#0b1220` |

Contrast (WCAG 2.1; AA needs 4.5:1 for body text, 3:1 for control outlines):

| Pair | Light | Dark |
| --- | --- | --- |
| text on bg | 18.72 | 15.63 |
| text on surface | 17.09 | 13.60 |
| text on sidebar | 17.45 | 16.33 |
| text-muted on bg | 7.58 | 7.30 |
| text-muted on surface | 6.92 | 6.36 |
| text-muted on sidebar | 7.06 | 7.63 |
| link on bg | 5.47 | 10.06 |
| link on surface | 5.00 | 8.76 |
| danger on bg | 6.47 | 6.77 |
| success on bg | 5.02 | 10.74 |
| on-brand on brand | 10.06 | 10.06 |
| on-accent on accent | 11.22 | 11.22 |
| border-strong on bg | 4.76 | 3.93 |
| border-strong on surface | 4.34 | 3.42 |

`on-danger`/`on-success` are `bg`'s own colour, so their contrast on a danger or success fill is the same figure as "danger on bg" / "success on bg" above, just with the two colours swapped (contrast is symmetric).

The theme follows the system. The root element may carry `data-theme="light"` or `data-theme="dark"` to override it.

## Type

Three self-hosted web fonts, subset to Latin, `woff2`, `font-display: swap`, precached by the service worker with the shell (files and licence in `app/public/fonts/README.md`):

| Token | Family | Weights | Use |
| --- | --- | --- | --- |
| `--font-display` | Poppins | 600, 700 | Page titles, section titles, the wordmark, headings |
| `--font-sans` | Source Sans 3 | 400, 600 | Body, UI, notes |
| `--font-mono` | JetBrains Mono | 400 | Paths, file names, keyboard hints |

Each falls back to the system sans-serif (or monospace) stack while its face loads or if it fails to load. No Google Fonts request ships in production.

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 12 px | Timestamps, badges |
| `--text-sm` | 14 px | Captions, secondary labels |
| `--text-base` | 16 px | Body text, note content (line height 1.5) |
| `--text-lg` | 20 px | Section titles, note titles in lists |
| `--text-xl` | 24 px | Page titles on mobile |
| `--text-2xl` | 32 px | Page titles on desktop |
| `--text-3xl` | 40 px | Empty states, the welcome screen |

Weights: 400 body, 500 labels and buttons, 600/700 headings (`--font-display`). Headings use line height 1.2.

## Motion

Three durations, two easings, transform and opacity only:

| Token | Value | Use |
| --- | --- | --- |
| `--motion-fast` | 120 ms | Hover, press, focus ring |
| `--motion-base` | 200 ms | Panels, sheets, drawer, toasts |
| `--motion-bird` | 320 ms | The bird's entrances and reactions |

`--ease-out` for entrances, `--ease-in-out` for loops. Under `prefers-reduced-motion: reduce` nothing loops: the bird holds a pose and one dot pulses where progress is shown.

## Spacing and shape

Spacing is a 4 px grid: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24, `--space-8` 32, `--space-12` 48, `--space-16` 64 px. Touch targets are at least 44 × 44 px. Radii: `--radius-sm` 6 px (inputs, chips), `--radius-md` 10 px (buttons, cards), `--radius-lg` 16 px (sheets, dialogs), `--radius-full` (avatars, pills).

## Do and don't

- Do put the mark on white, slate or navy; don't put it on teal, amber or a photo.
- Do use navy text on teal and amber fills; don't use teal or amber as text on a light background.
- Do keep the bird facing right, flat and in its own colours; don't rotate, mirror (except when an animation turns it round), outline, add gradients or recolour it.
- Do use the navy-square favicon or app icons below 24 px; don't shrink the bare mark or the wordmark below their minimum sizes.
- Do say "Bower" in text with a capital B; don't set the name in the wordmark font inside running text.
