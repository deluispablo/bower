# c4-undo-confirm-in-place

The online confirmation now uses the existing replace mechanism at src/ui/report.ts:19–24.
The success callback returns its confirmation words; undoToast passes the Undo result to it
and replaces the original id without an action. The existing keyed toast element survives,
so its entrance animation does not restart. No second confirmation toast is emitted.

src/features/bower/BowerScreen.tsx:74 returns the rule confirmation.
src/features/files/file-actions.ts:62–66 routes move Undo through undoToast and returns its
confirmation; src/features/files/file-actions.ts:108–111 returns the Bin/restore confirmation
while preserving restored selection and bookmarks.
src/ui/toast.tsx:114–123 applies the existing focus-return rule when the action disappears
from a retained toast, releases its keyboard hold, and preserves other focus destinations.
The existing plain timer remains 4000 ms. Offline copy, retry action and focus stay unchanged.
Move now shares the same offline refusal mechanism rather than its previous detached callback.

## Research (offline)

Reused the existing offline replace path in src/ui/report.ts:26–30 and the keyed rendering
in src/ui/toast.tsx. The installed React implementation confirms that matching keys reuse
children: node_modules/react-dom/cjs/react-dom-client.development.js:6771–6796, updateSlot.
Reference: https://react.dev/learn/preserving-and-resetting-state (no network request made).

## Tests and verification

Red: `an online Undo confirmation replaces its toast in place` failed on its same-element
assertion at src/ui/undo-confirm.test.tsx:24 before the fix (undefined versus original box).
Log: /tmp/confirm-red.log. The test also covers a single box, removed Undo, focus return,
and the precise 3999/4000 ms lifetime using fake timers.

Green: pnpm exec tsc -p tsconfig.app.json passed; /tmp/confirm-tsc.log.
Green: pnpm exec vitest run src/ui src/features passed, 37 files / 166 tests; /tmp/confirm-unit.log.
Green: targeted eslint passed with the two existing Fast Refresh warnings in toast.tsx;
/tmp/confirm-eslint.log. git diff --check passed.

Playwright was not run, as instructed. The existing fake-source spec runs on phone and desktop;
the added check retains the DOM handle, compares horizontal placement and bottom edge
(the text may reflow), checks no active entrance animation, removes Undo and runs expectAxeClean.

pnpm check could not start: another session held the shared heavy-run lock. Waiting commands
were cancelled without touching the other session. /tmp/confirm-check.log records the lock.
The coordinator still needs the full gate and phone/desktop e2e before integration.

tests changed: e2e/c4-undo-compensate.spec.ts: extend online Bin Undo with identity, position, no-rise and axe checks.
compatibility: 20e76dc1

## Files per coordinator commit

1. Red: src/ui/undo-confirm.test.tsx; e2e/c4-undo-compensate.spec.ts.
2. Fix: src/ui/report.ts; src/ui/toast.tsx; src/features/files/file-actions.ts;
   src/features/bower/BowerScreen.tsx.
3. Notes: docs/harness/2026-10-10-c4-undo-confirm-in-place-notes.md.

No git write command was run. Replace 20e76dc1 with the coordinator's fix commit SHA.
