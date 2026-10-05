# Independent immutable review: session-folder-isolation

Plan revision: **2026-10-05-contracts-2**. Phase: **P2**. Capabilities: **C01, C14**. Entry: **session-folder-isolation**.

Base: `7c48f4d71290415a79e5bdc0b9b073407190eaa0`.
Candidate: `8bd67cdd77e3b3f32459b3708eccdf7d8bb80c8b`.
Prepared checkout: `/private/tmp/bower-p2-journal-ack`, `codex/p2-session-isolation`.

**Verdict: changes requested.** The original account/folder cache and original-owner late-effect failures are repaired in the supplied evidence, but one bounded closure/storage finding remains. No entry closure or phase acceptance is granted.

## Finding

**Minor — delayed reads can write person state after full Sources disposal.** Candidate references: `src/data/live/index.ts:72`, `:135`, `:162`, `:232`; `src/data/vault/drive-vault.ts:125`, `:315`, `:638`.

Trigger: hold an actual `listAll` result, start `vault.refresh()` and `vault.markSeen('Synthetic.md')` awaiting that same listing, call `Sources.dispose()`, then release the result. Full disposal sets the outer disposed flag but leaves its epoch unchanged. The scope-active predicate and door/post-read checks compare epoch only; DriveVault.checkCurrent also ignores its own disposed flag. Therefore the awaited index and markSeen continuation still pass, and markSeen writes global `bower:seen` after closure. Clearing listeners blocks notifications, not this storage mutation.

Status: first identified by independent source inspection, then **actually reproduced by the coordinator at this exact candidate**. `/private/tmp/bower-dispose-seen-probe.cjs`, `/private/tmp/bower-dispose-seen-8bd67cd-results.json`, and `/private/tmp/bower-dispose-seen-8bd67cd.log` show both promises fulfilled and `bower:seen` changing from null to the synthetic file/version. The assertion failed with exit 1. This proves closure/storage behavior; it does not prove cross-account leakage or a browser/provider failure. No baseline reproduction of this particular closure case was supplied, so this report does not label it newly introduced.

Requested correction: invalidate read/storage/public-result eligibility on full disposal, without stopping already-issued mutations from reaching original-owner bookkeeping. Add a genuine controlled assertion red against this candidate for the held-listing + late-seen case before fixing it. Preserve existing disposed-run behavior and original-owner journal retention; do not claim issued I/O cancellation or rollback.

## Checked compatibility and evidence

Only the six permitted files changed: live/index.ts, session.ts, runs.ts, live.test.ts, vault/drive-vault.ts and journal.ts. Sources/Me/Worker wire, durable journal records, device-key definitions, note grammar and runner-file formats are unchanged. Stable facade identities and subscriptions dispatch to fresh scoped vault/run instances; concrete refresh/flush/settled/lastRun/runningPiles capabilities remain available. Own method overrides used by existing composed-source tests remain supported.

| Assigned area | Inspection and meaningful named assertions |
| --- | --- |
| Cached account/folder state; signed-out refusal | Fresh scoped vault instances and guarded roots; test cases under `reused sources isolate account and folder changes` for `new account and folder` and `same account, new folder`, each with `cached note read`, `creation placement`, `journal placement`; `signed-out note/create/request refuses` (live.test.ts:78–129). |
| Old reads and pre-dispatch writes | Epoch checks around root resolution, Drive reads and public results; `old listing/text cannot publish in B`, `prepared rename stops before dispatch`, `same-folder sign-in does not reactivate an old read` (:131, :161, :393). |
| Observed late effects and outboxes | Journal captures owner before queue admission (:148–163); scoped inactive post-effect records retain A lines; stable original Drive identity preserves volatile WeakMap storage. `late create keeps A bookkeeping without B publication`, `A outbox returns only to A, blocked storage false/true`, `queued journal keeps its owner, blocked storage false/true`, `late versioned task effect has only A outbox bookkeeping` (:176, :202, :227, :450). |
| Uploads, Undo and device storage | Upload continuation exits before removed-pile trash, next dispatch, progress or emit when inactive; disposed scoped vault releases unsent bodies. `old Undo and seen cannot act in B`, `late seen cannot repopulate B device state`, `late upload cannot trash or continue after transition`, `transition before upload prevents dispatch` (:249, :263, :294, :314). Full disposal exception is the finding above. |
| Run queues, hydration and locks | Replaced runs dispose/reset independently; fresh admissions do not wait for old queues. `queued admissions cannot block or dispatch in B, flushJournal/process`, `old terminal hydration cannot publish in B`, `signed-out run locks/seen does not retain A` (:330, :356, :437). Existing run-order/foreground assertions retained. |
| Session/auth/subscription lifetime | Session epochs reject old identity/folder replies; auth watcher does not expire a newer scope; expire explicitly calls forgetThisPerson (session.ts:153–158). `stable subscriptions follow fresh B work`, `old auth reply does not expire B`, `old me reply cannot reveal A after B confirmation`, `old folder reply cannot publish A steps`, `dispose during sign-in prevents late identity publication`, `failed sign-out permits a fresh lifecycle retry` (:281, :377, :410, :422, :476, :491). |

The existing `a run already going when the app opens is followed at the fast pace` fixture adds only sessionStorage.clear beside localStorage.clear. Its timing and `writing` phase assertion remain intact. The appended isolation cases use two actual FakeDrive roots, actual bytes/metadata/domain effects and controlled replies; synthetic Worker identity switches remain explicit. The same-person cases switch folders through sign-out/sign-in, rather than proving every possible real provider folder-transition route.

Supplied red progression ends with **29 actual failures / 5 passes / 50 filtered exclusions** against unmodified base production (`final-boundary-red.log`). The targeted candidate log has **34 passes / 50 filtered exclusions**; full `check.log` has **515 passes / 51 files** and completed checking/build/harness gates. Intermediate failed checks are superseded by this final gate, not counted as successful proof. The reviewer inspected logs; the reviewer executed no tests or builds.

Coordinator original public probes at this SHA both pass: `account-switch-8bd67cd-results.json` records B bytes, new content and saved journal under B, with A unchanged; `account-late-effect-8bd67cd-results.json` records readable stale-operation refusal, the already-applied A effect retained, A outbox containing its file ID, and empty B outbox. These are coordinator runtime observations, separate from this reviewer's read-only reasoning.

## Boundaries and limitations

No further actionable finding was established within the assigned delta. Successful issued I/O may settle in A; there is no cancellation or rollback guarantee. Inbox addPile historically creates no new journal event: refusal after a late folder result is not itself a missing-journal defect; incomplete-pile readiness remains separately open. Volatile journal recovery requires the same live Drive identity/page; this is not durable reload recovery. Synthetic existing-wire identity stubs are not real OAuth/account switching or backend-authority proof.

No browser, native app, live provider, model, R1–R4, O3 acceptance, protected ownership grammar or final combined gate was run by this reviewer. Preserved source guards and supplied existing tests support compatibility with task bytes, pile prechecks, run ordering, foreground refresh and request preflight; they do not establish full C14 recovery or full P2 capability acceptance. Renew immutable review after correction and supply fresh combined gates before any broader acceptance.
