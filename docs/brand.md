# Brand

Bower is named after the bowerbird, which builds and decorates a bower from twigs and bright finds. The mark is that bird: flat, friendly, side view. The same drawing is the app's mascot, animated on every screen. The CSS tokens that implement this page live in `app/src/styles/tokens.css`; change both together.

## Mark and files

One drawing (v9, a satin bowerbird, D29 of the v5 spec; the v8.2 rig with a head 10 % bigger, an eye 20 % bigger, a pink blush `#ff9fb4`, a violet iris ring `#8e7cf3`, a shorter beak and props 30 % bigger; the bottle cap the bird reaches for in Shiny is blue, `#3b82f6`) on a 100 × 100 grid, facing right, feet on y = 91: a round teal body (`#5fcfbc`) with a lighter belly (`#b9ece2`); a round head on a same-colour neck; one big navy eye (`#1b2233`) with two white highlights and a faint pink blush; an upper and a lower eyelid in head colour; a pill-shaped amber beak (`#f0b64f`) with a darker jaw (`#d9952e`); one long leaf-shaped dark-teal wing (`#2f9c8d`) lying along the flank, hinged at the shoulder; three thin dark-teal tail feathers fanning back and up from the rump; two amber stick legs with flat pill feet. No gradients, no outlines, no raster. It holds a twig, paper or gem only while carrying one, so the mark has none. The lockups, icon sizes, one-colour version and clear space were drawn on the approved design canvas.

| File | Use |
| --- | --- |
| `app/public/logo.svg` | Mark only, transparent. Avatars, sign-in page. The in-app header draws the animated bird instead (`<Bird state="looking">`). |
| `docs/assets/logo.svg` | The mark for the README and GitHub, a committed drawing, like the other README drawings (not written by `build.py`; the generator that drew them was retired, see git history). |
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
| `hd` head (neck, eye, lids, blush, beak) | base of the neck, 60 64 | turns, stretches up, leans, tucks |
| `ey` eye | centre | blink, wink, dilate, look left or right |
| `ld`, `lb` upper and lower lid | centre | upper comes down (worried, sleepy, asleep, offline, confused), lower comes up (happy, proud and the lively states) |
| `jw` jaw | hinge | chirp, sing |
| `wg` wing | shoulder, 54 57 | flap, flutter, spread, shrug, shelter, cheer |
| `tl` tail (three feathers) | rump, 30 76 | flick, wag, fan, settle, stream in flight |
| `ft` legs and feet | under the belly, 47 84 | tuck in flight, crouch, step, fold in the nest |

Joints pivot in drawing units (`transform-box: view-box`, the numbers above are grid units), so no rotation can detach a part.

Props (the blue cap `bcap`, the sound arcs `wv` of Listening, the page `rd` of Reading, the pointer dots `pdot` of Pointing, twig `tw`, paper `pp`, notes `nt`, question mark `qm`, z `zz`, sparkles `sp`, cloud `cl` and rain `rn`, scan dots `dd`, the "!" `ex`) are separate elements, hidden unless a state shows them. `scene` adds the inbox tray and the nest (`tray`, `nest`) of Tidying up, the twig pile and the growing nest (`bp`, `bn`) of Building, the sleeping nest (`nest2`) of Asleep and the gem of Shiny.

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
| Listening | Dictation while the microphone is on | Head up, sound arcs (`wv`) ripple, eye wide (curious face) | Loop while listening |
| Flying | The phone run chip while a tidy-up runs | Wings beat, tail streams, feet tucked | Loop while running |
| Reading | A note's "Bower's note" and Reading line | Holds a page (`rd`), eye follows the lines | Loop |
| Pointing | The tour and Learn Bower, at the thing being described | Points a wing at a spot; the pointer dots (`pdot`) show where; `down` aims it lower | Loop |
| Perched | Still pose, kept for a bird that must not count as animated | Still, slow blink | Still |

Since v6 there is no bird on the desktop sidebar (no ledge, no perch); the sidebar and the tab bar use stroke icons only, and Bower's item is the speech bubble.

**Poses used by v5 (R-BIRD).** Asleep (empty inbox, empty states, and the nap), Looking (the greeting and every idle bird), Listening (dictation), Flying (a run in progress), Happy (the still face after a win), Confused (a failed or partly done run, a missing folder) and the two rules of D30: Settle and Nap.

- **Settle.** A looping pose plays for `SETTLE_MS` (10 s) and then swaps to its still class (`s-*`); an event on the screen (a tap, a run change) wakes it for one more cycle. Under reduced motion the still class always replaces the pose.
- **Nap.** The greeting's bird is a button: tapping it plays Asleep for one cycle (`NAP_CYCLE_MS`, 4.8 s) and holds it still until the next tap.
- **One animated bird per screen.** `bird-presence.ts` counts the birds on screen; the phone run chip draws its bird only while no other bird is there (`useBirdRoom`), and a bird inside an overlay passes `overlay` so the others go still. Birds under 40 px are the still `BowerMark`, never `Bird`.
- **Sizes.** Search 72 px, the tour 80, the Bower tab 56, reading 64, empty states 64, the working sheet's Tidying stage 166.

Five still faces from the same dials (lids, jaw, eye, head): happy (lower lid up, jaw open, head up), curious (eye wide, lean in), worried (upper lid down, head down), sleepy (both lids closed, head tucked), proud (lower lid up, head up, wing and tail spread) (`face` prop). Plays-once states call `onDone` when the `rig`'s animation ends (right away with reduced motion); the caller switches back to Looking. Under `prefers-reduced-motion: reduce` (or `reducedMotion`) no state plays: the bird holds the still face of its state (Hello happy, Shiny curious, Confused worried, Asleep sleepy, Show-off proud, otherwise none).

### Regenerating

The shapes come from the design canvas (`BIRD_CORE` and `SCENE`); the app's component (`app/src/components/bird.tsx`, with `styles/bird.css` from the canvas's `CSS`) and `scripts/brand/build.py` each carry a copy, so change all three together. Then run `python3 scripts/brand/build.py`, which redraws the logo, both wordmarks and every icon from the v9 drawing. It rewrites every file above except `docs/assets/logo.svg` (a committed drawing), centres the bird by its measured bounding box, and fails if an icon is off-centre, the maskable bird leaves the safe zone, the bird fills less than 12 px of the 16 px favicon or `logo.svg` reaches 6 KB. It needs Pillow, fontTools, Playwright with Chromium and Poppins Bold on the developer machine (a system `Poppins-Bold.ttf`, else the app's own `poppins-700.woff2` with brotli installed; see the script header); none of these are app dependencies. After changing colours in `tokens.css`, run `python3 scripts/brand/contrast.py` (standard library only) and update the contrast table below.

## Palette

Brand colours: teal `#5fcfbc`, deep navy `#0b1220`, amber `#f0b64f`. Light is warm (off-white and beige, not slate). Teal and amber are fills; they are never text colours on a light background (teal on the light page is 1.99:1).

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--color-sidebar` | Explorer, bottom nav, drawer | `#f1efeb` | `#0b1120` |
| `--color-bg` | Page background | `#faf9f6` | `#111a2b` |
| `--color-surface` | Cards, sheets, inputs | `#ffffff` | `#1a2538` |
| `--color-surface-hover` | Hover, active rows | `#ebe8e2` | `#233049` |
| `--color-text` | Body text | `#1c2333` | `#dfe5ee` |
| `--color-heading` | Headings | `#1c2333` | `#f1f5f9` |
| `--color-text-muted` | Secondary text, captions | `#475569` | `#9fabbf` |
| `--color-brand-tint` | Selection, callouts, tag pills | `rgb(95 207 188 / .16)` | `rgb(95 207 188 / .16)` |
| `--color-link` | Links, text buttons | `#278074` | `#5fcfbc` |
| `--color-brand` | Primary button fill, highlights | `#5fcfbc` | `#5fcfbc` |
| `--color-on-brand` | Text on `--color-brand` | `#0b1220` | `#0b1220` |
| `--color-accent` | Badges, the "new" dot, the twig | `#f0b64f` | `#f0b64f` |
| `--color-on-accent` | Text on `--color-accent` | `#0b1220` | `#0b1220` |
| `--color-border` | Dividers (decorative) | `#e3e0da` | `#2c3a54` |
| `--color-border-strong` | Input and control outlines | `#64748b` | `#64748b` |
| `--color-focus` | Focus ring (the same values as `--color-accent-line`) | `#278074` | `#5fcfbc` |
| `--color-danger` | Errors | `#e12020` | `#ef8a8a` |
| `--color-on-danger` | Text on a `--color-danger` fill (e.g. the danger button) | `#ffffff` | `#0b1220` |
| `--color-success` | Confirmations | `#256f43` | `#7ed3a1` |
| `--color-on-success` | Text on a `--color-success` fill (e.g. the "done" button) | `#ffffff` | `#0b1220` |

The soft set (the design canvas's Brand board, spec §14) gives one accent value each for teal, amber, success and danger; on light, `--color-link`/`--color-focus` and `--color-danger`/`--color-success` are a darker shade of the same hue instead of the literal accent, because the accent value alone fails AA as text or a fill's own text on the light (warm) page — see the contrast table. Dark uses the literal accent values throughout.

Contrast (WCAG 2.1; AA needs 4.5:1 for body text, 3:1 for control outlines):

| Pair | Light | Dark |
| --- | --- | --- |
| text on bg | 14.91 | 13.74 |
| text on surface | 15.70 | 12.14 |
| text on sidebar | 13.67 | 14.87 |
| text-muted on bg | 7.20 | 7.50 |
| text-muted on surface | 7.58 | 6.63 |
| text-muted on sidebar | 6.60 | 8.12 |
| link on bg | 4.51 | 9.23 |
| link on surface | 4.74 | 8.16 |
| danger on bg | 4.50 | 7.19 |
| success on bg | 5.81 | 9.71 |
| on-brand on brand | 9.93 | 9.93 |
| on-accent on accent | 10.26 | 10.26 |
| border-strong on bg | 4.52 | 3.66 |
| border-strong on surface | 4.76 | 3.23 |

Table generated by `python3 scripts/brand/contrast.py`; all pairs pass. `on-danger`/`on-success` are not checked by the script (it only checks `on-brand`/`on-accent`): on dark, the fill is the light pastel accent so dark navy text (`#0b1220`) reads well, same as `on-brand`/`on-accent`; on light, the fill had to darken to pass AA as its own pair above, so its own text flips to white (`#ffffff`) instead.

### v5 tokens

Added for the v5 screens (runs, notes, folders). Values are in `app/src/styles/tokens.css`; every colour is defined in light and dark.

| Token | Light | Dark | Use | Contrast check |
| --- | --- | --- | --- | --- |
| `--color-scrim` | `rgb(7 12 22 / .5)` | `rgb(5 9 18 / .62)` | Every scrim (replaces the hard-coded ones) | none, not text |
| `--color-warn` | `#865605` | `#f0b64f` | Partly done, Needs you, Check | 5.96:1 on bg, 6.27:1 on surface (5.18:1 on its tint over bg, 5.43:1 over surface); 9.54:1 on bg, 8.43:1 on surface |
| `--color-warn-bg` | `rgb(134 86 5 / .1)` | `rgb(240 182 79 / .12)` | Warn boxes | text uses `--color-text`: 12.97:1 and 10.88:1 on bg |
| `--color-danger-bg` | `rgb(225 32 32 / .08)` | `rgb(239 138 138 / .12)` | Did not finish | text uses `--color-danger-text` |
| `--color-danger-text` | `#c21b1b` | `#ef8a8a` | Small text on `--color-danger-bg` | 5.10:1 on the tint over bg; 5.98:1 dark |
| `--color-success-bg` | `rgb(37 111 67 / .1)` | `rgb(126 211 161 / .12)` | Done steps, high score | text uses `--color-text`: 12.96:1 and 10.79:1 on bg |
| `--color-updated` | `#2859a8` | `#93c5fd` | The "Updated" tag and the rule-change line (same as `--color-origin-web`) | 6.47:1 (5.02:1 on its tint over bg, 5.27:1 over surface) and 9.65:1 on bg |
| `--color-updated-bg` | `rgb(47 99 184 / .18)` | `rgb(147 197 253 / .2)` | Tint behind `--color-updated` | `--color-updated` text reaches 5.02:1 (bg) and 5.27:1 (surface) |
| `--color-accent-line` | `#278074` | `#5fcfbc` | Strokes, see below | 4.51:1 on bg, 4.74:1 on surface, 4.13:1 on sidebar (light); 9.23:1 on bg (dark) |
| `--z-chip` `--z-toast` `--z-scrim` `--z-overlay` `--z-viewer` | 30, 35, 40, 41, 100 | same | The stacking order | none |
| `--radius-sheet` | `20px` | same | The sheet's top corners | none |
| `--sidebar-width` | `264px` | same | Explorer width; a preference sets it, clamped 200 to 480 | none |

The light `--color-danger` (`#e12020`) stays for fills, but it is 3.99:1 on `--color-danger-bg`, under 4.5:1 for small text. Text on that tint uses `--color-danger-text` (`#c21b1b`).

`--color-accent-line` is for strokes: focus rings, selected outlines, the current row's inset bar, the spinner arc, the progress bar and the selected radio. Teal `#5fcfbc` on cream or white is about 1.9:1, under the 3:1 that WCAG 1.4.11 asks of non-text contrast, so on light these use `#278074`. Dark keeps `#5fcfbc`. Teal stays for fills that carry dark text.

The new pairs are checked by `python3 scripts/brand/contrast.py` and `app/test/tokens.test.ts`.

### v6 tokens

Added for the v6 foundations (spec §2.1 to §2.5, issue #904). The dark theme is the reference. The light theme keeps every value it had: a colour role that is new in v6 is, in light, an alias of an existing light role, so nothing in light changes. Three dark values changed: `--color-sidebar` `#0b1120` → `#0e1626`, `--color-heading` `#f1f5f9` → `#f3f6fa`, `--color-border` `#2c3a54` → `rgb(223 229 238 / .18)`.

| Token | Dark | Light (alias) | Use |
| --- | --- | --- | --- |
| `--color-surface-raised` | `#162034` | `--color-surface` | Cards, stat tiles, grid tiles, Bower's note box |
| `--color-surface-overlay` | `#1f2b42` | `--color-surface` | Desktop popovers |
| `--color-surface-strong` | `#2a3850` | `--color-surface-hover` | The segment that is on, the avatar circle |
| `--color-text-secondary` | `#c6cfdc` | `--color-text-muted` | Icon buttons, Skip, secondary text in cards |
| `--color-text-disabled` | `#6b7890` | `--color-border-strong` | A disabled glyph (the crossed-out microphone) |
| `--color-border-subtle` | `rgb(223 229 238 / .1)` | `--color-border` | Card borders, dividers, bar and panel edges |
| `--color-border-control` | `rgb(223 229 238 / .4)` | `--color-border-strong` | A control's only edge: chips, the outlined segmented track, the microphone |
| `--color-grab` | `#64748b` | `--color-border-strong` | The sheet's grab handle |
| `--color-selection` | `rgb(95 207 188 / .14)` | `--color-brand-tint` | Selected row, tree row, tile, sidebar item |
| `--color-accent-border` | `rgb(95 207 188 / .45)` | `--color-accent-line` | The accent card's border |
| `--color-danger-halo` | `rgb(239 138 138 / .18)` | `--color-danger-bg` | The ring round the stop square while dictating |
| `--color-badge-new-bg` / `-text` | `rgb(95 207 188 / .16)` / `#5fcfbc` | `--color-new` / `--color-new-on` | The New and Filed badges (the tint fails 4.5:1 on cream, so light keeps the solid tag) |
| `--color-badge-failed-bg` | `rgb(239 138 138 / .16)` | `--color-danger-bg` | The Did not finish badge |
| `--color-badge-check-bg` | `rgb(240 182 79 / .16)` | `--color-warn-bg` | The Check badge |
| `--shadow-lg` | `0 12px 32px rgb(0 0 0 / .4)` | `--shadow-md` | Desktop popovers and the centred dialog |

Theme-independent: type `--text-13` 13, `--text-15` 15, `--text-18` 18, `--text-28` 28 px; radii `--radius-xs` 4, `--radius-row` 8, `--radius-card` 12, `--radius-bubble` 14, `--radius-composer` 24 px (the text box and every search field); half steps `--space-1-5` 6, `--space-2-5` 10, `--space-3-5` 14 px; sizes `--hit` 44, `--control-lg` 48, `--control-sm` 40, `--row-tree-phone` 40, `--row-tree-desk` 28, `--topbar-h` 56, `--tabbar-h` 64, `--drawer-width` 324 (max 88vw), `--panel-side` 440 (max 100vw), `--popover-width` 320 (max 88vw), `--aside-width` 360, `--avatar` 30 px.

#### Bird sizes

`--bird-*` in `tokens.css`, mirrored by `BIRD_SIZE` in `app/src/components/bird-classes.ts`. `<Bird size="tab">` and `<BowerMark size="inline">` read the token; a number still works. Under 40 px the bird is the still `BowerMark`.

| Token | px | Where |
| --- | --- | --- |
| `--bird-inline` | 16 | Tree rows, About lists, inline meta |
| `--bird-icon` | 20 | Inside a 32 px row box |
| `--bird-tip` | 28 | The file tip |
| `--bird-box` | 32 | Bower's note header, the desktop preview |
| `--bird-drop` | 44 | Add's desktop drop hint |
| `--bird-sheet` | 52 | Help and about this |
| `--bird-confirm` | 56 | Add's confirm sheet |
| `--bird-running` | 70 | Add while tidying |
| `--bird-tab` | 72 | The Bower tab |
| `--bird-tour` | 80 | The tour |
| `--bird-hero` | 84 phone, 96 from 900 px | Home |

The bird faces right everywhere; the tidying pose (`p-tidy`) no longer turns round on the way back. Only the tour's pointing bird turns to face its target (`flip`).

#### Root colours

Each of the five places has one colour, used for its disc (`FolderMark`), its folder outlines and the document glyph of every original in it (`FileIcon`); `-on` is the text on a filled disc.

| Token | Dark | Light |
| --- | --- | --- |
| `--color-para-inbox` | `#f4a28c` | `#b8492f` |
| `--color-para-projects` | `#5fcfbc` | `#1f7a6d` |
| `--color-para-areas` | `#f0b64f` | `#9a6408` |
| `--color-para-resources` | `#93c5fd` | `#2f63b8` |
| `--color-para-archives` | `#c4b5fd` | `#6b52b8` |

`--color-help-icon` is teal (`#5fcfbc`) in dark and the muted text colour in light: the icons of the Help sheets.

#### Components

The shared parts every screen uses (`app/src/components/`; `ARCHITECTURE.md` → "App modules (v6)" has the behaviour):

| Component | Look |
| --- | --- |
| `Composer` | The one text box: radius `--radius-composer` (24), one `RoundButton` inside at the bottom right that never moves; one muted line under the box (red with a dot while dictating) |
| `SearchField` | The same box as a search field, with the magnifier, the shortcut hint on desktop (Ctrl K or ⌘ K) and the mic (32 px button on desktop) |
| `PageHeader` | Desktop breadcrumb 13 px muted (parents only, " / " between them); h1 28 px on the phone, 32 px from 900 px, wraps; (i) and ⋯ on its first line; the meta line with the 8 px root dot |
| `ListRow` | Icon box 32 with a 20 px icon, title, one meta line (kind and date only); selected: `--color-selection` |
| `FolderCard` | `Card` with the folder outline at 40 px in its root's colour, name, "<n> things · updated <when>", a New badge, up to three things inside |
| `FileIcon` | Bower's still mark for what Bower wrote; one document glyph for every original, stroked in its root's colour; folder outline for a subfolder; the disc for a root. Sizes 16, 20, 28, 40 |
| Overlays | Phone: a bottom sheet with a grab bar that hugs its content up to 90 %. Desktop: the side panel (`--panel-side` 440), the popover (`--popover-width` 320, `--shadow-lg`) or one centred dialog |
| Tree | Rows `--row-tree-desk` (28) in the sidebar, `--row-tree-phone` (40) in the drawer and the Folders tab; the drawer is `--drawer-width` (324) |

#### Primitives

In `app/src/styles/primitives.css` (imported once from `main.tsx`) and `app/src/components/`:

| Primitive | Anatomy |
| --- | --- |
| `.btn` | Primary: 48 high (`.btn-sm` 40), radius 12, 16 px 600 (sm 15 px), teal fill. `.btn-secondary`: transparent, 1 px `--color-border`. `.btn-text` and `.btn-danger`: links with a 44 px target. `.btn-block` fills the width; `aria-busy` shows `.btn-spinner` |
| `.chip` | Dark only: 32 high pill with a 44 px target, 14 px, 1 px `--color-border-control`; on (`aria-pressed` or `aria-checked`): teal tint and teal border. Light keeps today's chip (`layout.css`), and `BowerTag` keeps its light look too |
| `Badge` (`badge.tsx`) | 22 high pill, 12 px 700; tones `new`, `done`, `failed`, `check`, `filed`. `NewTag` is the `new` tone |
| Text roles | `.section-heading` (a real `h2`, Poppins 700 20 px, margin 20 0 8), `.overline` (12 px 700 uppercase .08em muted), `.group-label` (13 px 700 muted), `.meta` (13 px muted) |
| `Segmented` (`segmented.tsx`) | `.seg` track radius 10, padding 3; buttons 34 high (44 target), radius 8, 15 px; on: `--color-surface-strong`. `role="radiogroup"`, arrow keys, Home and End |
| `Card`, `StatTile` (`card.tsx`) | Radius 12, 1 px `--color-border-subtle`, `--color-surface-raised`, padding 12 14. Variants `plain`, `accent`, `bubble` (radius 14, never wider than its column). The stat tile's number is 24 px 700 `--color-heading` in the body font; a zero is not dimmed |
| `RoundButton` (`round-button.tsx`) | 40 px circle (32 in the desktop search field), 44 px target, same place in every state: `mic`, `asking` (pulsing ring), `mic-off` (crossed-out, dimmed, dashed), `arrow`, `stop` (square and halo), `spinner` |

Shared states: one focus ring (2 px `--color-focus`, 2 px offset); hover only on a fine pointer (rows `.hover-row` `--color-surface` at 60 %, primary teal at 90 %); pressed `scale(.98)` in 120 ms, none under reduced motion; disabled 40 % with `aria-disabled` where the control stays focusable. `.hit` gives any control a 44 × 44 target under 900 px or on a coarse pointer.

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
