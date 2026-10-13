# B5c adversarial pass 2 (Sol high, attempt 14)

card:
- **Blocking: data safety — [runner/src/claude.ts:921](/private/tmp/bower-b5c/runner/src/claude.ts:921).** With an existing Bower profile and real note `Alex has diabetes..md`, source `Alex uses TypeScript.` accepts profile `Alex uses TypeScript. [[Alex has diabetes.]]`. The engine persists the unsupported health claim. Unaliased link titles disappear from verbatim validation.

- **Blocking: data safety — [runner/src/claude.ts:917](/private/tmp/bower-b5c/runner/src/claude.ts:917).** Source and profile `Alex has passport ID-884422.` pass admission and update the existing profile. The sensitive-identifier check misses this ordinary phrasing, exposing the passport ID.

- **Blocking: hard rule — [src/data/spine/scripted.ts:2017](/private/tmp/bower-b5c/src/data/spine/scripted.ts:2017).** With no profile and a valid `cv` row declaring `template: "profile"`, reply `note.typeRow: "cv"` bypasses profile admission. A body containing 401 repetitions of `TypeScript` creates an uncited, 401-word profile carrying `profile=cv`. This path also accepts invented prose.

- **v1 limit — [runner/src/claude.ts:926](/private/tmp/bower-b5c/runner/src/claude.ts:926).** Source `It is untrue that Alex uses TypeScript.` accepts and persists `Alex uses TypeScript.` in the existing profile. Substring matching loses the denial.

The five original exact cases are addressed; broader grounding gaps remain. Finding 3 exposes an alternative profile-authoring path through the shared template mechanism.

Skipped full suites, e2e and live-model checks; used offline admission/planner/engine probes. No files changed.
verdict: BLOCK
