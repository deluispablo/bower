# Bower app, phase 1: the UI — design

Date: 2026-10-04. Status: approved in conversation with the owner.

## Why a new project

Bower (the current repo) works, but its app carries years of patches. This project starts the app again from zero, using the current Bower only as a reference for behaviour, copy and the API contract — never copying code. It stays local (no remote) until the owner says otherwise.

The rebuild runs in four phases, each with its own spec and plan:

1. **App UI** with demo data (this spec).
2. **App logic**: session, Drive, piles, tidy-ups, moves, against a fake Worker, then the real one.
3. **A new Worker.**
4. **A new agent**, matching the owner's local second brain (compile, not only file; summaries and index; sources; questions report; commit per run; mail).

## Goals of phase 1

- Every screen of the design canvas ("Bower app v10 screens") navigable and responsive, phone and desktop.
- Bower, the bowerbird, alive in the app: one per screen, moving like a bird.
- An Obsidian-like file explorer: tree, menus, drag to move, rename, sort, keyboard.
- Demo data (Alex's folder) behind typed interfaces, so phase 2 adds adapters without touching screens.

## Stack

React 19, TypeScript strict, Vite, PWA (`vite-plugin-pwa` arrives in phase 2). React Router for routes, Zustand for UI state, Radix primitives for menus, dialogs, sheets and tooltips, `cmdk` for the command palette, `dnd-kit` only if native drag and drop falls short. CSS Modules plus CSS custom properties generated from the brand `tokens.json`. No Tailwind. Every other runtime dependency needs a one-line reason.

## Structure

```
src/
  app/        shells, routes, providers
  features/   home, piles, files, note, tidy, bower, settings, onboarding, auth, palette
  data/       interfaces, types, demo implementation, scenarios
  bird/       rig, CSS poses, spring engine, presence
  ui/         primitives (Button, Sheet, Menu, Tabs, Row, Icon)
  styles/     tokens.css (generated), base.css
```

## Screens and navigation

Two shells, one set of routes. Under 900 px: phone shell (bottom tab bar Home, Files, Add, Bower; the tree as a drawer from the left edge; menus as bottom sheets). From 900 px: desktop shell like Obsidian (ribbon; left side panel with Files, Search, Bookmarks; tabbed content; optional right panel with Linked notes, Outline, Bower; status bar). Side panels collapse and resize; widths are kept per device.

| Route | Screen |
| --- | --- |
| boot (static in `index.html`) | Opening, slow, offline, failed |
| `/sign-in` | Sign in |
| `/welcome` | First sign-in: Bower makes the folder; welcome; first run |
| `/` | Home: piles, questions, "while you were away" |
| `/add` | Add: a pile of files with its text |
| `/pile/:id` | A pile (sheet on phone, tab on desktop) |
| `/files/*` | A folder as a list or a table |
| `/note/*` | A note: properties, current state, timeline, local graph |
| `/bower` | Talk to Bower; rules |
| `/settings` | Settings, including "Bower moves" |
| ⌘K | Command palette |

The tidy-up is global state, not a route: while a run is going its phases sheet opens; hidden, it is a chip (status bar on desktop). When it ends, Home shows "while you were away" and offers the replay.

## The tidy-up experience

A real run is a GitHub Actions job of about 5 minutes that reports only phase changes: `queued`, `reading` (with a total), `writing`, `saving`, then `done` or `failed` with the full report (where each item went, notes created and updated, things set aside, questions). So:

- **While running**: Bower loops the pose of the real phase (wait, read, write, carry). A steps list and an honest clock ("3 min so far. Usually about 5"). No invented progress bar. The person may hide it and is told when it ends.
- **When done**: the first time the result is seen, Bower replays the run in 5 to 8 s from the report, carrying each thing to the folder it really went to. Skippable; "Watch again" later.

## Data

Screens import only these interfaces (async, typed, errors as `BowerError { code: 'offline' | 'not-found' | 'conflict' | 'auth' | 'unknown', message }`):

- `Session`: current user, sign in and out, folder state, create the folder step by step.
- `VaultSource`: tree, note, move, rename, create, trash, piles, add and remove a pile, answer a question, subscribe to changes.
- `RunSource`: start a run (`all` or `instructions`), status, subscribe. `RunState` mirrors the real runner report.

The demo implementation keeps Alex's folder in memory (PARA folders, two piles, about 60 things, compiled notes with Current state and Timeline, two questions, rules). Moves and renames change the tree for real. The simulated run walks the real phases on a time scale (`demo` about 25 s, `real` about 5 min, `instant` for tests) and, when done, files the inbox and writes the report the replay uses. Scenarios (first time, back after a run, offline, slow start, failed run, empty inbox) are forced with `?scenario=` or a demo-only debug panel (⌘⇧D). No real personal data anywhere: `Alex`, `you@example.com`.

## Bower

- `BowerRig`: the v10 drawing with its pivots (head 60,50; wing 56,55; tail 32,70; legs 50,82; jaw 78,38; tuft 61,23; eye 70,34; feet on y 92).
- CSS poses for loops: idle, wait, read, write, carry, proud, sleep, alarm, land.
- A spring engine (requestAnimationFrame) for travel: flyTo, hopTo, peck, pickUp, drop, showOff; targets re-read every frame.
- Presence: one animated Bower per screen; the one behind an overlay holds still.
- Still under `prefers-reduced-motion` or when "Bower moves" is off; paused in a hidden tab; always `aria-hidden`, whatever Bower "says" is also text.

Rules from the brand book: head moves in snaps; nothing slides (hops or flights); every landing squashes; it faces what it attends to; it only moves things it holds.

## Quality

WCAG 2.2 AA: amber focus ring, everything by keyboard (tree with the ARIA tree pattern, Radix menus, ⌘K), 44 px targets, `role="status"` for run changes. UI copy in English, sentence case, no jargon ("your notes", "Bower folder"; never "vault").

Tests: Vitest for logic (tree operations, simulated run, run sentences); Testing Library for the explorer by keyboard and a pile's life; Playwright for each route and scenario at 390×844 and 1440×900 with screenshots and axe. `pnpm check` runs lint, types, tests and build.

## Build order

1. Base: Vite, TS, lint, tokens to CSS, fonts, theme, static boot screen.
2. `data/`: interfaces, Alex's demo, simulated run, scenarios.
3. Bower: rig, CSS poses, engine, an internal `/_bird` page.
4. Shells: desktop and phone.
5. The explorer.
6. Screens: Home and piles, Add, note, folder and table, Bower, Settings, ⌘K.
7. Tidy-up: phases sheet, chip, "while you were away", replay.
8. Sign-in, first time, boot states.
9. Polish: screenshot pass against the canvas, accessibility, light mode.

## Out of phase 1

Google sign-in, Drive and the Worker for real; push notifications; dictation; offline use; real search (phase 1 filters demo data).
