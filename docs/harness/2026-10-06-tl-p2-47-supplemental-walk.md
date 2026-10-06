# Technical-lead decision TL-P2-2026-10-06-47: one supplemental walk before P3 implementation

**Coordinator question, 2026-10-06:** P2 closed at dossier SHA `3e6e7da` under the owner's conditional acceptance. The dossier lists gaps that do not block. Should a supplemental walk run before P3?

**Ruling: yes, one bounded walk, and it runs before P3 implementation starts.** P3 planning may go ahead in parallel. The method requires that no known unresolved defect hides behind a green count ([METHOD](METHOD.md#phase-acceptance-before-feature-counts)). An unexplained FAIL in every cell is such a doubt, even when the suites are green.

## Scope of the walk

One fresh Sonnet evaluator session on the production build of the dossier SHA, demo and fake, phone and desktop:

1. **F1/F2 with a real keyboard.** Replay both focus cases in each cell. For each step, record `document.activeElement` (tag, text, id) through a script, plus a screenshot, rather than a pass/fail word. If this contradicts the earlier tool result, the recorded element decides. The standards are the [WAI-ARIA APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) (focus returns to the element that opened the dialog) and focus on the new view's heading after a route change.
2. **The cells not yet walked:** C06 in its remaining cells, and C07 and C01 on demo.
3. **Phone keyboard-only:** the C04–C11 journeys with an external keyboard profile at phone width.

## What it may produce

- **Critical or Important:** one fix round on P2, then the walk's failed rows are replayed. Nothing else is re-run beyond the four full suites on the new SHA.
- **Minor:** `P2_POLISH.md`, never an entry.
- **Clean:** P3 implementation starts.

## Turned into sensors, not walks

The two checks without tests become the first P3 batch entries, because a test catches regressions every run and a walk does not:

- C11, "no policy change from documents";
- an e2e assertion that the app logs no console error on the main journeys.

## Not decided here

The backup push to `backup/main` needs the owner's GitHub credentials. It stays pending in HANDOFF until the owner runs it or starts a session that holds them.
