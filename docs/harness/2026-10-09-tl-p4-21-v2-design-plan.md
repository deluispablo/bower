# Technical-lead decision TL-P4-21: building the designer's V2 spec

**Inputs:**

- the owner-approved spec [docs/design/specs/2026-10-09-v2.md](../design/specs/2026-10-09-v2.md), 24 blocks;
- the impact note [impact/2026-10-09-v2.md](impact/2026-10-09-v2.md) from `bower-impact`, with claims verified by the lead: `Sheet.tsx:30` sends every close to `#main`; `--line-strong` does not exist; `.skeleton` is defined but never used;
- the intake procedure, TL-P4-18 addendum 4.

**Owner's bar:** the build matches the design exactly, and is engineered with one home per mechanism and no duplicates: one message placement, one field rule, one bird reaction port.

## Rulings

1. **V2 joins stage 4.** Stage 4 is already the screen layer. The V2 blocks become entries in it, in the order below, and stage 4 starts after stage 3's smoke. Every V2 entry is `ui: true`: it carries the spec block's "now" as its red, its "accept when" as its verify, axe with the rules named in the block enabled by name (`target-size`, heading and landmark rules), and the designer's `verified` before close.
2. **Preparatory refactors first** (TL-P4-15 option b). Each creates or extends the one home that later blocks use:
   - **`c4-focus-return`** (Sonnet): one focus home. `Sheet.tsx` returns focus to its opener, not `#main`, which is d-v2-04's red.
   - **`v2-dock`** (Sonnet): one bottom dock with `--dock-h`. Every message and toast is placed through it (d-v2-01), and `scroll-padding` keeps focus above it (d-v2-03). It runs after `c4-focus-return`, because both touch `ui/toast.tsx`.
   - **`v2-field`** (Sonnet): the new token `control-line` in `tokens.json`, plus one field rule in `src/ui/` that every field and checkbox uses (d-v2-08). Screens stop styling their own fields.
   - **`v2-perched-bower`** (Opus, `src/bird/` only):
     - one engine hook shared by BowerLayer and PoseBower; PoseBower becomes a perched use of the engine, and its 12 call files keep their props;
     - presence gains a "minor" flag, so a small Bower never takes the one-bird turn;
     - the engine gains named poses.

     d-v2-07, d-v2-24 and d-v2-06 build on it.
3. **Contract change, d-v2-02.** `VaultSource.answer` returns an undo handle: an additive change to the source port, with every source implementing it and old callers unaffected. It is Opus and escalated. It goes after `v2-dock`, after `c3-pair-ask` merges, and after the designer's answer on the "now", "waits" and "failed" outcomes, because a yes that starts a run at once cannot always be undone honestly.
4. **Bower behaviour.** d-v2-24 splits in two:
   - **24a (Opus):** the one `react()` port and the engine actions;
   - **24b (Sonnet):** each screen calls `react()` by its BowerMap row, with no screen-local animation.

   The BowerMap rows go into the repository as text in the spec's folder, so tests can cite them.

5. **Spec claims the code contradicts:**
   - d-v2-13: there is no skeleton in use. The red is the live dot and step marker pulsing, and the dead `.skeleton` CSS is removed.
   - d-v2-21: `/files/Inbox` redirects to Home, so the destination of "See all" goes to the designer.
   - d-v2-22: Settings already has the account rows; the block keeps only its layout changes.
6. **Waits for other entries:** d-v2-11 waits for `c3-pair-ask` (it edits RunLinks and NoteScreen), and d-v2-20 waits for `c4-run-view`.

## Order (at most two workers; files do not overlap within a pair)

1. `c4-focus-return` with d-v2-04 ∥ `v2-field` (d-v2-08)
2. `v2-dock` (d-v2-01, d-v2-03) ∥ `v2-perched-bower`
3. d-v2-05 with d-v2-10 (targets) ∥ d-v2-09 (after `v2-field`)
4. d-v2-07 (Opus) → 24a (Opus) → 24b ∥ d-v2-06 (Opus, after 24a)
5. d-v2-02 (Opus, after the designer's answer)
6. The planned stage 4 data entries, which absorb V2 parts:
   - `c4-query-store`;
   - `c4-resource`, with d-v2-13's loading copy;
   - `c4-use-action`;
   - `c4-run-view`, with d-v2-16b;
   - `c4-copy`;
   - `c4-test-timers`;
   - `c4-e2e-fixtures`.
7. d-v2-11 → d-v2-20; d-v2-15 → d-v2-22; d-v2-14 with d-v2-17
8. d-v2-12, d-v2-13 (CSS), d-v2-16a, d-v2-18, d-v2-19, d-v2-21 (after the designer), d-v2-23 (after `c4-use-action`)

The impact note lists 32 second-way risks. Each packet cites the risks for its block and the home to use instead, and the review's "second way?" question checks them.

## Before dispatch

The designer answers the questions below and confirms that this plan is faithful to the spec:

- d-v2-02: the copy and Undo for each outcome;
- d-v2-07: the blink bounds, and whether preen is new;
- d-v2-24: the BowerMap rows as text, settle versus hold, and the interrupt latency;
- d-v2-06: whether TidyScene's carried chip becomes the glyph;
- d-v2-12: "on our side";
- d-v2-19: whether the toast goes;
- d-v2-21: where "See all" leads, and the promise of "Ask Bower".

A difference the person would see needs the designer's yes, and the owner's if it is a matter of taste.
