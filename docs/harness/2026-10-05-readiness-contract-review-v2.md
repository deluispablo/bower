# Renewed readiness v2 affected-delta review

2026-10-05. Independent reviewer `/root/prerequisites_review`, bower-session/bower-review. contracts-2/P2 O3 C02/C12/C14/D02. Exact integration documentation base `1c7c9c449f7084469985c1d0c4af88bdde50068f`, source `1dc7f64b399b9ad2f893648e6e704a1e76905593`, main method `3136adccff8fef2be0f8623d9d574476f27db4c3`. Read-only Git inspection confirmed the checkpoint, clean integration tree, matching main planning revision and no source/e2e/scripts/package/lock/Vite change in this inspected source-to-checkpoint range. Root retains shared-record/integration authority; the ownership parser worker is separately reserved and was not inspected.

## Verdict

**No Critical, Important or Minor findings remain in this affected delta.** The v1 Important first-create ambiguity and Minor S02 overclaim are resolved by frozen v2. TL-P2-2026-10-05-03 already adopts the immutable readiness direction, dedicated .bower/piles namespace, loose-file authority ordering, consumer-first direction and capture/retirement invariants. This review does not reopen those decisions or require another D02 owner policy decision.

This is clean renewed proposal-delta review, not ratification of a final producer schema, code activation or qa13/P2 closure. Final concrete shape/compatibility fixtures must still be returned for the specific ratification required by TL-P2-03 before new producers/migration. Those absent details are openly pending, not a new defect hidden by this verdict.

## Immutable identity and exact scope

- Frozen v2 `/private/tmp/bower-p2-readiness-contract-proposal-v2.md` and repository `docs/harness/2026-10-05-readiness-contract-proposal-v2.md`: identical SHA256 `5e4cadacbbd844ec0715aa0fb5bf75ba6abd94c39ddace1e2b7e40d34000b684`.
- Preserved v1: `9044204ff2dfde69945ba6a55e26bd5c902d0eeed755e6633507ffe8b31243c7`.
- Preserved prior review: `2b8c0fecfeb029a1dbfde5367501e1b11a8c675c31af387c1c6c35e7884750ab`.
- Exact archived diff `docs/harness/evidence/2026-10-05-o1/readiness-v1-to-v2.diff`: SHA256 `fb9cc66852aaade9236232ea0c5bf548e2c7999d41b57deb3fac5190d8dc6353`. Independently reconstructed unified diff is byte-identical.
- All16 prior source/evidence pins are unchanged in v2 and still match inspected bytes. Original proposal/review/reproduction and R1 packet were not modified.

Reviewed only the changed first-create paragraph, S02 paragraph, added/split fixtures and narrow provenance preface, against prior findings and current adopted decision. Unchanged aspects reuse the prior review; no repeat full contract audit or new runtime proof is claimed.

## Resolution of Important first-create ambiguity

V2's declaration/publication paragraph now explicitly distinguishes layouts. A loose single file/link without context is initially authorized by the confirmed immutable declaration, independently verified authenticated root/Inbox parent and stable member/create-intent key. Its own nonexistent file ID is not required. The actual ID binds only after unique in-scope effect reconciliation to declaration/key, expected parent and completion/content evidence. A real pile folder must be reconciled before context/children. No placeholder file, mandatory folder conversion or binary-update API is invented. This matches TL-P2-03's adopted ordering and preserves existing consumer layout.

Declaration/member intent retain scope/body identity across refusals or unknown replies. A proven before-effect member refusal can retry the same key after revalidation; possible effect must be reconciled first or remain unresolved. Changed bytes cannot silently reuse intent, and unknown authority before initial creation preserves the draft instead of dispatching. V2 does not pretend current upload metadata supplies independent binary-hash proof or that lost replies are now implemented safely.

New fixtures at lines55–56 independently specify zero files/folders on a pre-effect loose refusal, discovery from the declaration, same-key retry with exactly one eventual loose file in the original Inbox, then actual-ID binding. The possible-effect fixture expects verified unique completion and zero second create; duplicate/wrong-scope/changed/unverifiable effects remain unresolved without Bin or blind retry. Folder/note-only fixtures retain reconciled-parent ordering. These are planned discriminators, not executed tests.

## Resolution of Minor S02 evidence wording

V2 says only that existing central person cleanup synchronously clears retrievable current-page holder references even if later Storage access fails. Denial alone does not invoke cleanup or discard Add's in-page bytes. It explicitly disclaims durable Blob storage, quota/eviction listeners and unconditional retention, and labels future D02/reselection/remote-member discovery unimplemented.

Fixtures now separate metadata denial while the page remains alive (line62), future unavailable retained bytes requiring matched reselection (line63), and successful sign-out/central cleanup including blocked Storage (line64). The last preserves truthful attempted/denied-key semantics, outbox/preferences and failed-remote-signout preservation/retry. No blocked key is certified erased and no current S02 claim is used as remote discovery proof. This accurately respects prior bounded S02 evidence without expanding it.

## Remaining exact ratification and limits

TL-P2-03 is authoritative over the preserved proposal's historical “proposed/lead should approve” wording: .bower/piles and the selected direction are now adopted. Remaining ratification concerns the concrete producer/consumer data shape and tests: supported schema/version and exact fields, canonical bytes/hash interpretation, logical IDs/opt-in references, trusted scope/parent authority and durable create-intent/evidence binding; precise activation/legacy fixtures and integration with captured-set/completed-removal disposition. V2 names concepts and suggested paths, but contains no final field declaration/schema/validator or adopted public API. This review does not invent them. Preserve the separate O3 run/capture/report schema assignment and D02 recovery interaction prerequisites.

The existing six-path candidate outline and qa13 named verify remain unchanged. Pure helper preparation is allowed only under an actual disjoint assignment; producer/consumer activation waits for accepted shape/fixtures. Refuse-only containment cannot close the entry's required eventual one-effect-per-member recovery. R1-OBS01/R4, actual context/content/parent safety, O4 recovery and complete P2 acceptance remain open; no conditional remedy follows from the inconclusive R1-D02 acquisition. No additional provider variant is authorized by this review; R1-D03 has its own lead decision and review lane.

I read/hash-inspected the immutable public delta, preserved reports, current records and adopted TL-P2-03; performed no project imports/modules/tests/init/build/network/browser/provider/private access, Git mutation, source/shared-record edit, delegation, adoption or closure. The only new output is this report. No new green execution or cryptographic remote-byte/durable recovery guarantee is claimed. Next: root can return the corrected exact proposal and this scoped review for the concrete schema ratification already specified by the lead, while independently authorized work continues.
