# Start-up loading screen: implementation spec (2026-10-01)

**For the technical lead.** This spec covers what Bower shows from the first byte of `index.html` to the first usable screen, and when it hands over. It replaces the bare `<p class="app-loading">Loading…</p>` in `app/src/app.tsx` and the unstyled first paint of `app/index.html`. There are no boards for this piece; the screenshots next to this file are the reference for today's behaviour. Written against `main` at `1d55ca56` (worktree HEAD `4137b9cf`, same app code). Verified on the local demo build (`pnpm -C app build:demo` + `vite preview`), dark theme, 375 × 812 and 1280 × 800, with and without network throttling.

Requirement IDs: `R-BOOT-<n>`.

---

## 1. Brief and decisions

- **Goal:** when the owner opens Bower, they see Bower at once (never a white or empty screen), know it is opening, and land on the real screen without a jump or a flash.
- **Audience:** the owner opening the installed PWA on a phone (375) or desktop (1280), signed in, dark theme; also the first visit (nothing cached) and a slow or absent network.
- **Piece:** this implementation spec, split into 2 issues.
- **Constraints:** existing tokens and components; the v9 bird and `docs/brand.md`; English, no jargon, never "vault"; reduced motion and a screen-reader status; no new dependency; CSP `script-src 'self'` unchanged; light theme unchanged except that it also gets a correct background.
- **Done when:** from the first paint, the page shows the theme background and the bird; a status line appears only if opening takes longer than 600 ms; slow, offline and error states each say what to do; the real screen (Home with its existing skeletons, Sign-in, Welcome) replaces it with one 200 ms fade.

### Decisions

| ID | Decision | Why |
|---|---|---|
| D-1 | One boot screen, written in `app/index.html` as `<div id="boot">` **outside** `#app`, styled by an inline `<style>`. Phases (a) and (b) are the same element; JavaScript only changes its `data-state` and text, then removes it. | No markup duplicated between HTML and Preact, so nothing jumps at the moment JS takes over. The inline style is allowed by the CSP (`style-src 'unsafe-inline'`). |
| D-2 | No inline `<script>`. The splash follows `prefers-color-scheme` in CSS; the manual theme override (`bower:pref:theme`) is applied by the existing `initTheme()` the moment `main.tsx` runs. | CSP is `script-src 'self'` with no hash; an inline script would be blocked. A blocking `/boot.js` would add a round trip on the first visit. Trade-off in §6.3. |
| D-3 | Bird: the still v9 mark (the drawing of `app/public/logo.svg`, inlined, `aria-hidden`), 72 px (`--bird-tab`), at both widths. It "breathes" (CSS only) once the status line shows. The animated `<Bird>` is not used. | The static mark is the brand's own file for the sign-in page; it is the same drawing the OS splash and the app icon show, so phase (a) continues the OS splash. `<Bird>` needs Preact and would mean a swap mid-load. |
| D-4 | Nothing but background + bird for the first 600 ms. "Opening Bower…" fades in at 600 ms (CSS `animation-delay`, no JS needed). | A warm open of the installed app takes 100–500 ms; text that appears and vanishes inside that window is a flash. Bird on background reads as the continuation of the OS splash. |
| D-5 | Minimum show: if the session answers before 600 ms, hand over at once. If the status line has appeared, keep it until at least 1100 ms after navigation start (500 ms on screen), then fade. | No text flash; the worst added wait is 500 ms, only when the open was already slow. |
| D-6 | Maximum: at 8 s the line becomes "Still loading…" with a "Try again" link. The request keeps going; if it answers, hand over as usual. | The `/me` fetch has no timeout (`app/src/api.ts`, `apiFetch`); today "Loading…" can stay up for as long as the browser waits. |
| D-7 | A CSS-only safety net: if JavaScript never runs (a failed chunk, a stale cache), the "Try again" link appears at 8 s by itself, with the slow hint. | Without JS nothing else can ever change the boot screen. |
| D-8 | Hand-over: the real screen renders in `#app` under the boot screen, then `#boot` fades out (opacity 1 → 0, 200 ms `--motion-base`, `--ease-out`) and is removed from the DOM. Reduced motion: removed at once. | One transition, no layout shift; the existing skeletons are already in place underneath when the fade starts. |
| D-9 | Phase (c) keeps the existing skeletons (`Skeleton`, Home's `SkeletonTile`, the sidebar tree skeleton) and their 300 ms delay unchanged. The boot screen covers only "who is this person" (`/me`), not the folder listing. | Home already shows a shaped skeleton while Drive answers, and the cached index paints first when IndexedDB has one (#922). A full-screen loader over Home would hide work that is already visible. |
| D-10 | A start-up network failure with no saved copy shows the error state on the boot screen, instead of sending a signed-in owner to the sign-in page with "Could not reach the server." | The owner is not signed out; offering "Sign in" for a network problem sends them the wrong way. |
| D-11 | Manifest `background_color` becomes `#111a2b` (dark `--color-bg`). **Decided (O-1): (a).** | Android draws its splash in this colour; today it is `#ffffff`, so a dark-theme owner sees white, then navy. |
| D-12 | `theme-color` stays `#0b1220` (unchanged). | Out of the brief; it already matches the navy of the icon. |

---

## 2. Review of today's start-up

### 2.1 What happens, in order

1. **HTML** (`app/index.html`): `<div id="app"></div>` and nothing else. No inline style, no `color-scheme`. Until the stylesheet arrives, the page has the browser's default canvas (white in Chrome and Safari when `color-scheme` is not declared) and no content.
2. **CSS and JS** are external: the build puts 25 startup scripts (129.8 KB gzipped, `check-size`) and the stylesheets into `<head>` (45 `link` tags in the built page). `body` gets `--color-bg` only when `layout.css` has loaded; `html` itself never gets a background (`rgba(0,0,0,0)`), so the overscroll area on iOS stays the default colour.
3. **`main.tsx`** runs `initTheme()` and renders `<App>`.
4. **`SessionProvider`** (`app/src/session.tsx`) starts `GET /me` (Worker: cookie check, KV reads, quota read). While it waits, `AppRoutes` returns `<p class="app-loading">Loading…</p>`: muted 16 px text, centred, no bird, no live region. On the real instance this is the round trip to the Worker; on the demo `/me` is answered locally.
5. **`/me` answers:**
   - signed in → the shell renders; `VaultProvider` starts the Drive listing and the IndexedDB read in parallel (#922). Home shows skeleton tiles, Pinned and Recent skeletons and the sidebar tree skeleton (300 ms delay, `SKELETON_DELAY_MS`) until either answers;
   - 401 → `/login` (or `/welcome` on a first visit of the demo);
   - network failure with a cached `me` → the shell, offline;
   - network failure with nothing cached → `status: 'signed-out', error: 'Could not reach the server.'`, so the sign-in screen with an error line.
6. **Service worker** (`app/src/sw.ts`): precaches the shell, including `index.html`; every navigation falls back to it. On the installed app, phases 1–3 come from the cache and the delay the owner feels is step 4 plus the Drive listing.

### 2.2 Measured on the local demo

| Run | First paint with theme bg | JS renders (`Loading…`) | Shell with skeletons | Home usable |
|---|---|---|---|---|
| Warm, service worker, no throttle, 375 (rAF probe in an iframe) | 34 ms (14–34 ms: empty, no bg) | 47–72 ms | 102–124 ms | 170–189 ms (cached index) |
| Cold, no cache, 400 ms latency, ~400 kbit/s, 375 | 3.4 s (0–3.4 s: nothing) | 4.8–6.5 s | — | 6.5 s |
| Cold, no cache, 150 ms latency, 1.5 Mbit/s, 1280, slow listing switch on | 1.9 s | 3.1–3.6 s | 3.6–6.75 s | 6.75 s |

Not measurable here: the real `/me` round trip (the demo answers it in-process). On the installed app the shell is cached, so the wait the owner feels is the Worker round trip on a phone network, typically several hundred ms, with no upper bound because `apiFetch` sets no timeout.

### 2.3 Findings

| ID | Where | Observation | Oracle | Sev |
|---|---|---|---|---|
| F-1 | `app/index.html` | No background before the stylesheet: blank default canvas (white in dark mode) for 14–34 ms warm, up to 1.9–3.4 s cold. | Brand (dark theme is the reference), Nielsen 1 (visibility of status) | P1 |
| F-2 | `app/index.html` | Between CSS and JS: an empty navy page with no sign of Bower for 1.2–1.4 s on a slow network (`slow-02`, `desk-02`). | Nielsen 1 | P1 |
| F-3 | `app/src/app.tsx` | "Loading…" alone: no bird, no brand, not announced (no `role="status"`), no slow or error state. | WCAG 4.1.3, brand | P1 |
| F-4 | `app/src/styles/layout.css` `.app-loading` | `min-height: 100vh` produces a vertical scrollbar while loading (`slow-03`). | Supermodel tour | P2 |
| F-5 | `app/src/api.ts` | `/me` has no timeout: on a stalled network "Loading…" stays indefinitely with no way out but a manual reload. | Nielsen 3 (user control) | P1 |
| F-6 | `app/src/session.tsx` | A network failure with no saved copy lands on the sign-in screen, which tells a signed-in owner to sign in. | Nielsen 9 (recover from errors) | P2 |
| F-7 | `app/vite.config.ts` | Manifest `background_color: '#ffffff'`: Android's launch splash is white, then the app is navy. | Brand | P1 |
| W-1 | Home, sidebar | Skeletons shaped like the content (tiles, Pinned, Recent, tree) with a 300 ms delay and reduced-motion fallback. Keep. | — | WORKS |
| W-2 | `vault-store.tsx` | Cached index paints first; Drive listing runs in parallel (#922). Keep. | — | WORKS |

Screenshots (next to this file): `slow-01..04-*.png` (375, cold, throttled), `desk-01..05-*.png` (1280, cold, throttled, slow listing), `01..04-*.png` (375, first probe; the service worker answered some requests, kept for the Home and tour reference).

---

## 3. Ideas and references

Closed brief: no brainstorm round. Patterns used, all common practice: the static HTML app-shell splash (the PWA "app shell" model), the delayed indicator (show nothing under ~0.5–1 s, Nielsen's response-time limits of 0.1 s / 1 s / 10 s), skeletons for the content phase, and an escalation to a recovery action near the 10 s attention limit. No open-source code needed; no dependency.

---

## 4. Boards

None. The states are specified in §6 with exact sizes, colours and copy. Reference: today's screenshots in this folder.

---

## 5. System changes

### 5.1 Tokens

No new token. Because the boot screen paints before `tokens.css` loads, its inline style repeats these token values as literals. A unit test keeps them equal (R-BOOT-9).

| Use | Token | Light | Dark |
|---|---|---|---|
| Background (`html`, `#boot`) | `--color-bg` | `#faf9f6` | `#111a2b` |
| Status line | `--color-text-muted` | `#475569` | `#9fabbf` |
| Secondary line (slow, offline, error) | `--color-text-muted` | `#475569` | `#9fabbf` |
| First line in slow, offline, error | `--color-text` | `#1c2333` | `#dfe5ee` |
| "Try again" text and border, focus ring | `--color-link` / `--color-focus` | `#278074` | `#5fcfbc` |
| Bird size | `--bird-tab` | 72 px | 72 px |
| Gaps | `--space-4`, `--space-2` | 16 px, 8 px | same |
| Radius of "Try again" | `--radius-sm` | 6 px | same |
| Fade | `--motion-base`, `--ease-out` | 200 ms, `cubic-bezier(0.16, 1, 0.3, 1)` | same |

Contrast: these are the pairs already in the brand contrast table (muted and link on `--color-bg` pass AA in both themes); no new pair.

### 5.2 Components and assets

- New markup in `app/index.html`: `#boot` (see §6.1). The bird is the `<g>` of `app/public/logo.svg` inlined (1.8 KB), not an `<img>` (an `<img>` is a second request on a cold start).
- New module `app/src/boot-screen.ts` (no Preact): `bootState(state)`, `dismissBoot()`, `startBootTimers()`. Exported functions with explicit return types; pure helpers unit-tested.
- Removed: `.app-loading` rule in `app/src/styles/layout.css` and its `<p>` in `app/src/app.tsx`.

---

## 6. Per state

### 6.1 Layout and markup (all states)

```html
<div id="boot" aria-busy="true">            <!-- data-state: absent | slow | offline | error; data-leaving during the fade -->
  <svg class="boot-bird" viewBox="0 0 100 100" width="72" height="72" aria-hidden="true" focusable="false">…v9 mark…</svg>
  <p class="boot-line" role="status" aria-live="polite">Opening Bower…</p>
  <p class="boot-hint">This is taking longer than usual.</p> <!-- second line; BOOT-3 in the markup, hidden in the normal state -->
  <a class="boot-retry" href="">Try again</a> <!-- hidden until slow, offline, error, or the 8 s fallback -->
</div>
<div id="app"></div>
```

- `#boot`: `position: fixed; inset: 0; z-index: 1000` (above the app while it renders under it), `display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px`, padding `max(16px, env(safe-area-inset-*))`, background `--color-bg` literal. The group sits at the optical centre: `padding-bottom: 8vh` so the bird is slightly above the middle.
- Same layout at 375 and 1280: the group is centred, max-width 20 rem (320 px), text centred. Nothing else on screen at either width (no sidebar placeholder: the shell skeleton appears only after the hand-over).
- `html` also gets the background literal (fixes the overscroll area) and `color-scheme: light dark`, plus `<meta name="color-scheme" content="light dark">` in `<head>`.
- Text: `font: 400 16px/1.5 'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif`. The web font may not be loaded yet; the fallback is accepted (no font preload added).
- Theme selection in CSS, same selectors as `tokens.css`: light values by default; dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) … }` and `:root[data-theme='dark'] …`.

### 6.2 States

| State | When | Bird | Lines | "Try again" | Motion |
|---|---|---|---|---|---|
| **Start** | 0–600 ms | Still mark | `.boot-line` present for screen readers but `opacity: 0` | Hidden | None |
| **Normal** | 600 ms → answer | Still mark, breathing | BOOT-1, muted | Hidden | Line fades in 200 ms at 600 ms (`animation-delay: 600ms`); bird breath starts at 600 ms |
| **Slow** | 8 s from navigation start, no answer yet | Still mark, breath stops | BOOT-2 (text colour) + BOOT-3 (muted) | Shown | Lines swap without animation |
| **Offline** | `/me` failed with a network error, no saved copy, `navigator.onLine === false` | Still mark, no breath | BOOT-4 + BOOT-5 | Shown | None; the page reloads by itself on the `online` event |
| **Error** | `/me` failed with a network or server error (not 401), no saved copy, online | Still mark, no breath | BOOT-6 + BOOT-7 | Shown | None |
| **No-JS fallback** | 8 s and `#boot` still has no `data-state` (JS has not run yet, or never will) | Still mark | BOOT-1 stays; BOOT-3 (already in the markup) shown by CSS | Shown by CSS (`animation-delay: 8s`); hint and link space reserved from the start | None |
| **Sign-in needed** | `/me` → 401, or not invited | — | — | — | Hand-over to `/login`, `/welcome` or `/not-invited` (the real screen is the message) |
| **Offline with a saved copy** | network failure, cached `me` | — | — | — | Hand-over to the shell, which shows its existing offline banner |
| **Signed in** | `/me` answers | — | — | — | Hand-over; Home's skeletons take over (D-9) |

Bird breath: `transform: scale(1, 1.03)` ↔ `scale(1, 1)`, `transform-origin: 50% 91%` (the feet line of the v9 grid), 2.4 s, `ease-in-out`, infinite, starts at 600 ms. Stops in slow, offline and error (`data-state` set).

Reduced motion (`@media (prefers-reduced-motion: reduce)`): no breath; the line appears at 600 ms with no fade (`animation: none; opacity: 1` behind the same delay via a `step-end` animation, or simply visible from 0 ms; implementer's choice, either passes); hand-over removes `#boot` with no fade.

### 6.3 Hand-over (phase b → c)

1. `SessionProvider` leaves `loading` (any outcome above except offline and error with nothing saved).
2. `AppRoutes` renders the real screen into `#app` (under `#boot`).
3. `dismissBoot()` in a `useEffect` after that render:
   - `t = performance.now()` (ms since navigation start);
   - `t < 600` → remove at once (nothing but the bird was shown, which the OS splash shows too);
   - `t >= 600` → wait until `t >= 1100`, then set the `data-leaving` attribute (`data-state` keeps its value) (opacity 0 over 200 ms `--ease-out`, `pointer-events: none`), and remove the node on `transitionend` or after 250 ms, whichever comes first;
   - reduced motion → remove at once after the minimum.
4. Focus: unchanged from today. The first page load keeps the browser's own start (`onRouteChange` is not called for it). If focus was on "Try again" when the hand-over happens (the user tabbed to it), move focus to `#app`'s first heading via the existing `focusNewPage(null)` before removal, so focus is not lost on a removed node.

Theme trade-off (D-2): an owner whose manual theme is the opposite of the system theme sees the system background for the time JS takes to start (~50 ms warm, more cold), then the right one. Accepted. The `M` alternative is a hashed inline script (`'sha256-…'` added by `scripts/generate-headers.mjs`) that reads `bower:pref:theme` before paint; not in this spec.

---

## 7. Copy table

Ellipsis is the single character `…` (U+2026), as in today's "Loading…". No "vault", no "server" jargon beyond the error line already used in the app.

| ID | State | Element | Text | Limit |
|---|---|---|---|---|
| BOOT-1 | Normal | `.boot-line` | `Opening Bower…` | 24 |
| BOOT-2 | Slow | `.boot-line` | `Still loading…` | 24 |
| BOOT-3 | Slow | `.boot-hint` | `This is taking longer than usual.` | 48 |
| BOOT-4 | Offline | `.boot-line` | `You're offline.` | 24 |
| BOOT-5 | Offline | `.boot-hint` | `Bower opens when you're back online.` | 48 |
| BOOT-6 | Error | `.boot-line` | `Bower could not reach the server.` | 40 |
| BOOT-7 | Error | `.boot-hint` | `Check your connection and try again.` | 48 |
| BOOT-8 | Slow, offline, error, fallback | `.boot-retry` | `Try again` | 12 |

The apostrophe is the typographic `'` only if the rest of the app uses it; today's copy uses the straight `'` (`G'day`), so use straight.

---

## 8. Accessibility

- `#boot` has `aria-busy="true"`; the bird `aria-hidden="true" focusable="false"`.
- `.boot-line` is `role="status"` `aria-live="polite"`. Its initial text is in the HTML (BOOT-1). State changes **replace its `textContent`** (not a CSS show/hide), so screen readers announce "Still loading…", "You're offline.", "Bower could not reach the server.". `.boot-hint` is not live (it follows the line; avoid double announcements); it is read in order when the user explores.
- Visually hidden is not used for BOOT-1: during 0–600 ms it is `opacity: 0`, still in the accessibility tree, so a screen-reader user hears the status right away.
- "Try again" is a real link (`href=""` reloads the current URL, keeps deep links, works without JS). Target ≥ 44 × 44 px: `display: inline-flex; min-height: 44px; padding: 0 16px; border: 1px solid` link colour, radius 6 px, text link colour, no underline. Focus: `outline: 2px solid` focus colour, `outline-offset: 2px`. When hidden it is `display: none` (out of the tab order).
- Focus is never moved to the boot screen automatically. The hand-over keeps focus valid (§6.3, step 4).
- `#app` gets no loading text of its own; the document title stays "Bower" until a route sets its own (#899).
- Reduced motion: §6.2.

---

## 9. Feasibility

| Element | Needs | Cost | Risks |
|---|---|---|---|
| Inline `<style>` + `#boot` markup + inline bird SVG in `index.html` | HTML/CSS only | S | `index.html` grows by ~4 KB (bird 1.8 KB, CSS ~1.5 KB); it is not in the `check-size` script budget. Keep the SVG minified. |
| `color-scheme` meta and `html` background | HTML | S | None. |
| Manifest `background_color` | one value in `vite.config.ts` | S | O-1: light-theme owners get a navy Android splash. |
| `boot-screen.ts`: states, timers, dismissal, `online` listener | small module, no Preact | S | Timers must be cleared on dismissal (no state change after removal). |
| `app.tsx`: drop "Loading…", render `null` while loading, call `dismissBoot()` | edit | S | Routes that used to wait under "Loading…" now render under the boot screen; they still render only after `status !== 'loading'`, so nothing changes for them. |
| `session.tsx`: failure with nothing saved → boot error/offline state instead of `signed-out` + error | edit of one branch | S | `status` stays `'loading'` in that branch so no route renders; the login screen's `error` line is no longer reached from start-up (leave the prop; it may be removed later). Tests of `SessionProvider` that expect `signed-out` with `error` must change. |

Total: M (two S issues touching different files).

**Service worker.** `index.html` is precached (`precacheAndRoute`, `NavigationRoute` to `/index.html`). The new splash reaches an installed app on the next update, after the owner accepts the existing refresh prompt (`registerType: 'prompt'`). Nothing to change in `sw.ts`.

**Android.** The OS shows `background_color` + the 512 icon until the first paint, then the page. With D-11 the sequence is navy splash → navy page with the same bird: continuous.

**iOS.** No manifest splash; a standalone web app shows a blank screen until the first paint, then the page. The inline background makes the first paint the right colour immediately. Launch images (`apple-touch-startup-image`, one per device size) are out of scope (L, many assets).

**Deep links.** A cold open of a lazy route (`/note/:id`) hands over when the session is known; the route chunk then loads inside the shell (precached on the installed app, so near-instant). Not covered by the boot screen; unchanged.

**Escalations.** None: no dependency, no API change, no CSP change.

---

## 10. Acceptance criteria

### Issue A: splash in `index.html`

- [ ] R-BOOT-1 `app/index.html` has `<meta name="color-scheme" content="light dark">` and an inline `<style>` that sets `html` and `#boot` background to `#faf9f6` (light) and `#111a2b` (dark, via `prefers-color-scheme` and `[data-theme='dark']`, light override via `[data-theme='light']`), using the same selectors as `app/src/styles/tokens.css`.
- [ ] R-BOOT-2 `app/index.html` contains `<div id="boot" aria-busy="true">` before `<div id="app">`, with the inline v9 mark (`aria-hidden="true" focusable="false"`, 72 × 72), `<p class="boot-line" role="status" aria-live="polite">Opening Bower…</p>`, `<p class="boot-hint">This is taking longer than usual.</p>` and `<a class="boot-retry" href="">Try again</a>`.
- [ ] R-BOOT-3 Layout per §6.1: fixed full screen, column centred, 16 px gap, 320 px max width, safe-area padding; identical at 375 and 1280.
- [ ] R-BOOT-4 `.boot-line` is `opacity: 0` until 600 ms, then fades in over 200 ms with `cubic-bezier(0.16, 1, 0.3, 1)`; the bird breathes per §6.2 from 600 ms; both stop under `prefers-reduced-motion: reduce` (line visible, no breath).
- [ ] R-BOOT-5 CSS for `#boot[data-state='slow' | 'offline' | 'error']` (breath off, `.boot-hint` and `.boot-retry` shown, line in text colour) and `#boot[data-leaving]`, a separate attribute so `data-state` keeps its value during the fade and nothing reflows (opacity 0 over 200 ms, `pointer-events: none`, breath off, the line keeps its opacity; no transition under reduced motion).
- [ ] R-BOOT-6 `.boot-hint` holds BOOT-3 in the markup. With no `data-state`, `.boot-hint` and `.boot-retry` appear together by CSS alone at 8 s (fallback while JS has not run), with their space reserved from the start; JS replaces the hint text in the other states.
- [ ] R-BOOT-7 "Try again" is ≥ 44 px high, link colour, 1 px border, 6 px radius, visible 2 px focus outline.
- [ ] R-BOOT-8 `app/vite.config.ts` manifest `background_color` is `'#111a2b'` (decided: (a)).
- [ ] R-BOOT-9 A unit test (`app/src/boot-html.test.ts`) reads `app/index.html` and `app/src/styles/tokens.css` and fails if the boot background and text literals differ from `--color-bg`, `--color-text`, `--color-text-muted`, `--color-link` in either theme, and checks the copy BOOT-1 and BOOT-8 is present.
- [ ] Opening the demo build at 375 and 1280, dark, with a throttled network: no white or empty frame; the bird is on screen from the first paint.

### Issue B: boot states and hand-over

- [ ] R-BOOT-10 New `app/src/boot-screen.ts` exports `bootState(state: 'slow' | 'offline' | 'error'): void`, `dismissBoot(): void`, `startBootTimers(): void`; it sets `#boot`'s `data-state` and replaces `.boot-line`/`.boot-hint` text with BOOT-2…BOOT-7 exactly; it is a no-op when `#boot` is absent (tests, the demo's later navigations).
- [ ] R-BOOT-11 `startBootTimers()` is called from `app/src/main.tsx` before `render`; it sets `slow` at 8 s after navigation start unless dismissed or already in offline/error.
- [ ] R-BOOT-12 `dismissBoot()` follows §6.3: immediate under 600 ms; otherwise not before 1100 ms; then `data-leaving` and removal on `transitionend` or 250 ms; immediate removal under reduced motion; all timers and the `online` listener cleared.
- [ ] R-BOOT-13 `app/src/app.tsx`: the `<p class="app-loading">Loading…</p>` branch renders `null`, and `dismissBoot()` runs once in an effect after `status` first leaves `'loading'`. `.app-loading` is deleted from `app/src/styles/layout.css`.
- [ ] R-BOOT-14 `app/src/session.tsx`: in the `getMe` failure branch with no cached `me`, the state stays `'loading'` and `bootState('offline')` is called when `navigator.onLine` is false, else `bootState('error')`; the error is still logged with `console.error`. In `offline`, a `window` `online` event reloads the page.
- [ ] R-BOOT-15 If focus is on `.boot-retry` at dismissal, focus moves to the new page via `focusNewPage` before the node is removed.
- [ ] R-BOOT-16 Tests (`app/src/boot-screen.test.ts`, jsdom, fake timers): normal → slow at 8 s with BOOT-2/BOOT-3; error and offline text; dismissal before 600 ms removes at once; dismissal at 700 ms waits until 1100 ms; no-op without `#boot`. `session` test: network failure with nothing cached keeps `'loading'` and calls `bootState('error')`.
- [ ] Opening the demo with `bower:demo:slow` set and a throttled network shows: bird → "Opening Bower…" → Home skeletons → Home, one fade, no scrollbar, no text flash on a fast open.

---

## 11. Issue split

| Issue | Title | Files owned | Size | Depends on |
|---|---|---|---|---|
| A | Start-up splash: no white flash, the bird from the first paint | `app/index.html`, `app/vite.config.ts`, `app/src/boot-html.test.ts` (new) | S | — |
| B | Start-up states: still loading, offline, error, and a clean hand-over | `app/src/boot-screen.ts` (new), `app/src/boot-screen.test.ts` (new), `app/src/main.tsx`, `app/src/app.tsx`, `app/src/session.tsx` (+ its test file), `app/src/styles/layout.css` | S/M | A (markup and CSS) |

No file is owned by both. B can be developed in parallel against the markup contract in §6.1 and merged after A. No runbook change: the change is visible only as UI copy, which lives in the code.

---

## 12. Open questions

- **O-1 Manifest `background_color`.** One value serves both themes. Options: (a) `#111a2b`, dark is the reference theme, light-theme owners see a navy Android splash then a cream page; (b) keep `#ffffff`, dark-theme owners keep the white flash on Android; (c) `#faf9f6`, same as (b) but warmer. **Recommendation: (a).** **Decided: (a)** (lead, 2026-10-01).
- **O-2 Manual theme before JS (D-2).** Accept the brief system-theme background for owners whose manual choice differs from the system, or pay `M` for a hashed inline theme script. **Recommendation: accept.** **Accepted** (lead, 2026-10-01): no inline theme script.

---

## 13. Completeness check

- Every state a person can meet has a row in §6.2 or an explicit hand-over: yes.
- Every string is in §7 and every error has its next step ("Try again", or automatic reload when online): yes.
- Every interactive element (only "Try again") has a name, a keyboard path and a 44 px target: yes.
- Every token used exists (§5.1); no new token: yes.
- Data: only `/me` (session) and its cached copy; missing and failed behaviour stated: yes.
- No `L` item; the two `M` alternatives (launch images, hashed script) are named as out of scope: yes.
- Escalations: none; O-1 and O-2 are the owner's: yes.
- Every acceptance criterion names a file, string or test and can be checked: yes.
- No boards, so no contradiction to list: yes.
