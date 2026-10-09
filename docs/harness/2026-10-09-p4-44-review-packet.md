# Packet: P4-44 review (stage 3: c3-reply-schema)

Starting model: Opus, fresh and read-only. Never start a server or run e2e; unit, runner and api tests only. No checkout of the main repo in any form. Run git with `-C /private/tmp/bower-c3-rs`.

- **Diff:** `git diff f20c4d3c..d0ecd806 -- src runner api` (red `592b1b41`, fix `0b32ddce`, notes `d0ecd806`; not merged). Worker notes: `docs/harness/2026-10-09-c3-reply-schema-notes.md` (see "For the lead").
- **Contracts:**
  - packet `docs/harness/2026-10-09-c3-reply-schema-packet.md`;
  - TL-P4-14 addendum 20 (note-edit is the one home at 8 × 200; layout.ts `RUNNER_WRITES`; zod 4 in the runner only; 37 named issues with unchanged retry text; `z.toJSONSchema` if the CLI takes a schema);
  - TL-P4-17 (the real entry point).
- **The fixed question:** second way? Your card must say "second way? no" or name it. Check limits, Bower's file lists and reply checks.
- **Look hardest at:**
  - every refusal kind keeps its text, and one fault gives the same kind as before;
  - the retry loop still retries once with the reason;
  - the `--json-schema` path: does the code still work if the CLI ignores the flag or returns text only;
  - the parameter type of `parseRunManifestV2` (a string, not `RUNNER_WRITES`): is it a gap;
  - the `previous` bound and the stored-manifest parse change (the lead is ruling on it): state the exact behaviour change;
  - zod enters through `check-dependencies` and knip, in the runner only;
  - the goldens are unchanged;
  - compatibility rows exist for the contract commits.
- **Reply:** the review card in `docs/harness/WORKER.md` (PASS or BLOCK), lines under 120 characters. Details in `/private/tmp/p4-44-review-notes.md`.
