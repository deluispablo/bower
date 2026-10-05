# Independent Timeline source-name review

- Session/entry: `p2-timeline-review-2026-10-05`, `timeline-source-names`.
- Adopted planning revision: `2026-10-05-contracts-2`; P2, C03/C16.
- Immutable base: `28d2ce2359a940f2e2d25b4f58af04636dd15a7b`.
- Immutable candidate: `621ac558ba1781a2ceac152636a068c667f1a7d3`.
- Checkout: `/private/tmp/bower-p2-journal-ack`, clean at candidate, branch `codex/p2-timeline-names` per assigned packet.
- Read-only review: source/Git and supplied evidence; no reviewer tests, builds, installs, browser use, provider calls, source/shared-record edits or delegation.

## Verdict

**Changes requested: one Minor correctness finding within the explicit assigned compatibility scope.** Naked file labels, preserved authored aliases, and supplied targeted proof otherwise meet the central entry. Correct the reachable dotted-folder case and obtain a genuine additional assertion red/green plus a new immutable candidate for renewed review. This report does not close the entry or certify full P2 acceptance.

## Finding

**Minor — distinguish folder targets before stripping extensions.** `src/features/note/NoteScreen.tsx:99–106`, particularly line 101, uses `thingName(nameOf(destination))` for every resolved destination. It never checks the destination node's type.

Trigger: an existing folder named `Garden.2026` has a naked Timeline source naming it; rename the existing folder to `Garden.2027`. Both demo and DriveVault record an ordinary folder rename with `from`/`path` (`src/data/demo/world.ts:606–620`, `src/data/vault/drive-vault.ts:197–214`). The resolver's direct name map excludes folders, but its fallback calls `formerNames(changes)` without filtering types (`src/features/note/resolve.ts:8–20`). `formerNames` accepts every rename/move and maps the former name to the new folder path (`src/data/links.ts:10–24`). Thus resolving `Garden.2026` returns the `Garden.2027` folder path. Candidate line 101 applies `thingName('Garden.2027')`, whose existing regular expression removes `.2027`, and shows **Garden** (`src/data/tree.ts:33–34`). Before the candidate, this Timeline label was the unstripped authored source. The candidate therefore introduces loss of a meaningful folder suffix and fails the explicit packet requirement that dotted folder names remain full names.

Evidence classification: **deterministic source trace/manual derivation, not a browser or test reproduction**. Ordinary folder sources that have no former-name mapping remain unresolved/raw and do not trigger the new stripping. Do not broaden this finding to claim that all folder names now resolve or all dotted folders lose their suffix.

Suggested correction: obtain the resolved node and use the existing plain-name transformation only for a file; preserve the complete name for a folder. Keep aliases verbatim and retain unresolved source behavior. No direct-folder resolver expansion or public schema change is needed. Add a real regression traversing an existing folder rename and former-name resolution before correcting the label; its assertion should fail at this candidate and pass only with the typed correction. An existing synthetic folder plus one minimal source fixture can exercise this through demo/fake UI without inventing an external provider.

## Scope and compatibility inspection

Only the four authorized files changed: NoteScreen, demo notes, qa12 and the separately reserved qa5 literal selector. No parser, public types, data source schema, serialization implementation, write path, journal or provider contract changed.

- **Targets and aliases:** `sourceLink` splits the first `|` into target/label before resolution. For the fixture `Lease draft.pdf|Lease copy.pdf`, destination remains the original PDF while the authored alias, including `.pdf`, remains verbatim. No alias string enters the resolver as a whole. Naked resolved file labels match FileView's `thingName(node.name)` and Original's existing plain label (`NoteScreen.tsx:201,257`). Resolved note labels naturally remove the final `.md`; dotted stems before that remain, following the existing file-page helper.
- **Web:** existing `webSource(target)` still decides whether an unresolved target is an http(s)/bare-host link, with safe existing external attributes. File resolution takes precedence, as before. Naked web labels/hrefs remain existing behavior; intentional web aliases can now use the alias without changing the destination. The supplied browser test exercises two naked web sources, including target `_blank` on the first; it does not directly exercise a web alias or inspect `rel` (the source supplies it).
- **Unresolved/empty:** an ordinary unresolved file source retains its complete authored target as an unresolved span and avoids stripping without an actual destination. A nonempty alias on an unresolved target remains its authored label in that span. Falsey empty source still does not render a From link. A syntactically empty alias is not validated/fallbacked by this change; no new claim is made that malformed source syntax receives comprehensive recovery. Existing unresolved tooltip and resolver limitations remain.
- **Serialization:** fixture adds one Timeline record to Flat 7/Cobble Row, retaining both Flat 3 naked PDF/photo records and the existing Cobble web source. `serializeNote` already writes a source as `[[${t.source}]]` (`src/data/vault/note-format.ts:167–181`); `timelineOf` preserves the entire pipe-containing source (`108–116`). Fake seed already passes demo notes through that serializer (`src/data/fake/seed.ts:65–76`), so the alias requires no format change.
- **Backlinks:** existing `linksIn` separates the target before the alias (`note-format.ts:119–125`). Added target is the existing PDF, not a new note link; no existing demo `links` arrays were changed. The fixture does not invent an alias note/file or replace the naked sources with alias-only data. Renderer only reads data and constructs React elements; no protected section/content writes were introduced.
- **Dependent Outline test:** qa5 line 277 changes only the expected visible source name from Lease draft.pdf to Lease draft, preserving its click, PDF destination, and existing desktop Outline assertions. No assertion was deleted to hide a failing journey.

## Supplied proof inspected

| Evidence | Observed result and meaning |
| --- | --- |
| `/private/tmp/bower-timeline-names-red.log` | Demo named qa12 test failed at line 38 in both phone and desktop: exact `Lease draft` link absent. The Original property assertion immediately before it passed. Genuine intended visible-label assertion failure, not startup/selector-layout failure. |
| `/private/tmp/bower-timeline-names-fake-red.log` | Same genuine line-38 failure in both fake sizes. |
| `/private/tmp/bower-timeline-names-green.log` | Named qa12 test passed twice in demo and twice in fake, no skips in those runs. It checks naked PDF/photo hrefs, matching destination headings, alias wording/PDF destination and existing web links. |
| `/private/tmp/bower-timeline-names-outline-green.log` | `the outline lists Bower's sections and sources link`: two passes per source; the phone branch intentionally returns after PDF navigation, while the desktop branch continues Outline assertions. |
| `/private/tmp/bower-timeline-names-check.log` | Supplied pnpm check completed: lint with existing warnings, typecheck, 51 test files/420 tests, production build, harness, bundle and landing checks. Existing chunk-size warning; no failure shown. |

These are implementer-supplied runs, not independently reproduced by this reviewer. Red execution stops at the first naked PDF label, so it does not independently demonstrate a separate baseline alias failure. Final green traverses the alias fixture, including fake serialization. Logs are assigned to the returned candidate by the coordinator packet; they do not establish a new backend contract.

## Proof limits and next step

No added test exercises the renamed dotted-folder path, unresolved source, heading/block suffix, web alias or malformed/empty alias. The folder gap is a concrete candidate correctness defect; the other branches were inspected and are coverage limits, not invented reproduced findings. Native manual evaluation is **NOT RUN**. Complete integration demo/fake gates remain pending, and targeted automated evidence does not replace them. No complete C03/C16 acceptance claim is made. After correction and genuine new regression proof, review the replacement immutable range before serial integration/closure.
