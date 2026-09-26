# Brand

Bower is named after the bowerbird, which builds and decorates a bower from twigs and bright finds. The mark is that bird: flat, friendly, side view, carrying a twig. The CSS tokens that implement this page live in `app/src/styles/tokens.css`; change both together.

## Mark and files

The bird is five shapes on a 64 × 64 grid: a teal body with a round head and a short tail cocked up and back, a smaller darker-teal wing (`#0f766e`), a navy eye, an amber beak and an amber twig. No gradients, no outlines, no raster.

| File | Use |
| --- | --- |
| `app/public/logo.svg` | Mark only, transparent. Avatars, in-app header, README. |
| `app/public/logo-wordmark.svg` | Mark + "Bower" with a navy word, for light backgrounds. The word is outlined from Poppins Bold (SIL Open Font License 1.1), so no font is loaded. |
| `app/public/logo-wordmark-dark.svg` | The same with a `#f1f5f9` word, for dark backgrounds. Pick the file by the page's theme (for example `<picture>` with a `prefers-color-scheme` source, or the app's current theme); neither file switches colour on its own. |
| `app/public/icons/favicon.svg` | Browser tab. Mark on a navy rounded square so it reads on light and dark tab bars. |
| `app/public/icons/favicon.ico` | Legacy favicon, 16, 32 and 48 px. |
| `app/public/icons/icon-192.png`, `icon-512.png` | PWA icons (`purpose: any`): navy rounded square, transparent corners. |
| `app/public/icons/maskable-512.png` | PWA icon (`purpose: maskable`): full-bleed navy; the whole bird sits inside the central circle of radius 40 % (the safe zone). |
| `app/public/icons/apple-touch-icon.png` | 180 × 180, full-bleed navy, no transparency (iOS rounds the corners itself). |

In every icon the bird's bounding box is centred on the canvas. Clear space around the mark: at least a quarter of its height. Minimum size: 16 px for the mark on navy, 24 px for the bare mark, 96 px wide for the wordmark.

### Regenerating

Edit the bird in `scripts/brand/build.py` (the only copy of its shapes), then run `python3 scripts/brand/build.py`. It rewrites every file above, centres the bird by its measured bounding box, and fails if an icon is off-centre, the maskable bird leaves the safe zone or `logo.svg` reaches 6 KB. It needs Pillow, fontTools, Playwright with Chromium and Poppins Bold on the developer machine (see the script header); none of these are app dependencies. After changing colours in `tokens.css`, run `python3 scripts/brand/contrast.py` (standard library only) and update the contrast table below.

## Palette

Brand colours: teal `#2dd4bf`, deep navy `#0b1220`, amber `#fbbf24`. Neutrals are from the slate scale. Teal and amber are fills; they are never text colours on a light background (teal on white is 1.86:1).

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--color-bg` | Page background | `#ffffff` | `#0b1220` |
| `--color-surface` | Cards, sheets, inputs | `#f1f5f9` | `#162033` |
| `--color-text` | Body text, headings | `#0b1220` | `#f1f5f9` |
| `--color-text-muted` | Secondary text, captions | `#475569` | `#94a3b8` |
| `--color-link` | Links, text buttons | `#0f766e` | `#2dd4bf` |
| `--color-brand` | Primary button fill, highlights | `#2dd4bf` | `#2dd4bf` |
| `--color-on-brand` | Text on `--color-brand` | `#0b1220` | `#0b1220` |
| `--color-accent` | Badges, the "new" dot, the twig | `#fbbf24` | `#fbbf24` |
| `--color-on-accent` | Text on `--color-accent` | `#0b1220` | `#0b1220` |
| `--color-border` | Dividers (decorative) | `#e2e8f0` | `#263349` |
| `--color-border-strong` | Input and control outlines | `#64748b` | `#64748b` |
| `--color-focus` | Focus ring | `#0f766e` | `#2dd4bf` |
| `--color-danger` | Errors | `#b91c1c` | `#f87171` |
| `--color-success` | Confirmations | `#15803d` | `#4ade80` |

Contrast (WCAG 2.1; AA needs 4.5:1 for body text, 3:1 for control outlines):

| Pair | Light | Dark |
| --- | --- | --- |
| text on bg | 18.72 | 17.09 |
| text on surface | 17.09 | 14.88 |
| text-muted on bg | 7.58 | 7.30 |
| text-muted on surface | 6.92 | 6.36 |
| link on bg | 5.47 | 10.06 |
| link on surface | 5.00 | 8.76 |
| danger on bg | 6.47 | 6.77 |
| success on bg | 5.02 | 10.74 |
| on-brand on brand | 10.06 | 10.06 |
| on-accent on accent | 11.22 | 11.22 |
| border-strong on bg | 4.76 | 3.93 |
| border-strong on surface | 4.34 | 3.42 |

The theme follows the system. The root element may carry `data-theme="light"` or `data-theme="dark"` to override it.

## Type

UI text uses the system sans-serif stack (`--font-sans`, Inter first when installed); no web font is downloaded. Code and file names use `--font-mono`.

| Token | Size | Use |
| --- | --- | --- |
| `--text-xs` | 12 px | Timestamps, badges |
| `--text-sm` | 14 px | Captions, secondary labels |
| `--text-base` | 16 px | Body text, note content (line height 1.5) |
| `--text-lg` | 20 px | Section titles, note titles in lists |
| `--text-xl` | 24 px | Page titles on mobile |
| `--text-2xl` | 32 px | Page titles on desktop |
| `--text-3xl` | 40 px | Empty states, the welcome screen |

Weights: 400 body, 500 labels and buttons, 700 headings. Headings use line height 1.2.

## Spacing and shape

Spacing is a 4 px grid: `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-6` 24, `--space-8` 32, `--space-12` 48, `--space-16` 64 px. Touch targets are at least 44 × 44 px. Radii: `--radius-sm` 6 px (inputs, chips), `--radius-md` 10 px (buttons, cards), `--radius-lg` 16 px (sheets, dialogs), `--radius-full` (avatars, pills).

## Do and don't

- Do put the mark on white, slate or navy; don't put it on teal, amber or a photo.
- Do use navy text on teal and amber fills; don't use teal or amber as text on a light background.
- Do keep the bird facing right, flat and in its own colours; don't rotate, mirror, outline, add gradients or recolour it.
- Do use the navy-square favicon or app icons below 24 px; don't shrink the bare mark or the wordmark below their minimum sizes.
- Do say "Bower" in text with a capital B; don't set the name in the wordmark font inside running text.
