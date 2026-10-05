# Corrected independent review: unchanged joint inventory and recovery schema

2026-10-05. Independent reviewer `/root/run_contract_review`, bower-session/bower-review. This narrow correction is assigned at immutable integration checkpoint `7bab8bc3c02763fcfce0be2576f3a42bfb5b8694`, ACTIVE section “B false finding withdrawn; exact corrected review reserved”. Adopted plan `2026-10-05-contracts-2`; P2 O3/O4 C02/C03/C12/C14; local main `3136adccff8fef2be0f8623d9d574476f27db4c3`. Initial schema assignment target remains `14472d99b9a41b46797eec7c050b2becef0d24ac`, source `1dc7f64b399b9ad2f893648e6e704a1e76905593`. The unrelated integrated pure parser does not change this frozen schema packet or its source pins.

## Corrected verdict

**Zero Critical, Important or Minor findings. I withdraw the sole Important finding in my initial report. No contract or fixture correction is required for that claim.** This is the independent exact-shape review for submission to the technical lead; it does not itself ratify the contract, activate a consumer, close a capability/entry or accept P2.

Preserve the initial report `/private/tmp/bower-p2-run-recovery-contract-review.md`, SHA-256 `6535422d0bc1236a604325ad8b32380bdc64e4b98356d931e812f5a5bbfdef55`, as an inaccurate historical review followed by this explicit correction. It must not be used as an outstanding-defect verdict. Neither its bytes nor the original contract/fixtures were edited. No replacement v2 packet was created for the withdrawn issue.

## Exact decoding evidence and review error

The original contract is unchanged at SHA-256 `aede6ef26f21b894dfd9c169cd158c812534ed333b8f77c461105529fcaabdeb`; its canonical ten-file manifest remains `3b954ed6a8b6e42c9188ead54b3b29657e79bd0f1fd3a1680fa371b2e0e218de`.

I re-read those exact bytes, decoded the literal JSON block with standard-library JSON and inspected the actual integer codepoints of `$defs.DriveId.pattern`, rather than interpreting escaped representations in a tool response. The result is:

```text
length: 25
U+005C count: 3
codepoints: [94,91,94,92,117,48,48,48,48,45,92,117,48,48,49,102,92,117,48,48,55,102,93,43,36]
```

There is exactly **one U+005C before each of the three Unicode escapes** after JSON decoding. The literal schema therefore expresses the intended exclusion of U+0000 through U+001F and U+007F. My initial finding incorrectly treated the extra JSON escaping of a printed Python representation in the tool output as additional characters inside the decoded regular expression. That was my review error. The assertion that ordinary fixture IDs were rejected was unsupported and false; it is withdrawn, along with the suggested schema change and ratification block based on it.

The coordinator separately executed a small standard JavaScript RegExp discriminator on the unchanged schema string, accepting `fake-root`, `receipt-file`, `inbox-folder`, `f`, `u` and `FOLDER_ID`, and refusing NUL, U+001F, DEL and empty string. That is **coordinator supplemental execution**, recorded in `docs/harness/2026-10-05-run-recovery-review-clarification.md` and its separately archived discriminator. I did not run that RegExp or any candidate/project/runtime test. The original ten-file packet manifest intentionally does not include the later discriminator; it remains intact rather than retrospectively absorbing new evidence.

## Prior inspection retained by reference

All other findings-free checks in the preserved initial report remain applicable to the exact unchanged packet: ten scratch/archive files byte-identical, all 21 source/evidence pins matched, nine literal fixtures inspected, 58 stored text/SHA-256 pairs matched, 15 operation identities and 31 checkpoint hashes/revision/previous links matched, and same-run report/disposition/reconstruction identities were consistent. These were read-only authoring-integrity/semantic inspections, not executed fixture journeys or runtime recovery tests. I did not repeat the full resolved review for this correction.

The initial report's “Checked contract properties without further findings”, “Literal fixture consistency inspected” and implementation limits carry by reference. Its DriveId finding, blocking verdict and first proposed correction step are superseded by this report. No other Critical, Important or Minor finding remains supported by that review.

## Boundaries and next step

Root can now submit the **original** exact contract/ten-file packet plus this corrected independent review for the already-required technical-lead ratification. Architectural direction and D02 remain adopted; schema acceptance still belongs to the lead. No new product-policy question or broad proposal rewrite follows from this review correction.

After ratification, a separately reserved pure shared-schema entry still needs a committed loadable stub, genuine assertion red/green, independent candidate review and coordinator inverse proof. Shared consumers follow the accepted schema commit. Actual shared fake service authority/scheduler, closed-client recovery, durable upload evidence, readiness retry, duplicate/lost-response effects and report-save/reopen publication require implementation and behavioral evidence. R1 safe real writes, R2 principal/session binding, R4 unknown-create/raw-byte recovery and R3 dispatch/claim premises remain independent. The unchanged metadata shape proves no real CAS, exactly-once behavior, exclusion of old writers or new provider remedy. Semantic capabilities, Undo, measured preparation/quality/performance and final UI/PWA/owner acceptance remain required.

Only this new corrected report was written under the narrow reservation. No source/fixture/shared-record changes, original-report edits, target modules/tests/init/build, dependency installation, network/provider/browser/private access, Git mutation, delegation, contract adoption or closure were performed.
