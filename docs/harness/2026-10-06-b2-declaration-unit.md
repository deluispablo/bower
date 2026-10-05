# B2 next unit: immutable declaration validation

Prepared by the integration coordinator under contracts-2, main10ca886 and TL-P2-04. This is the next small implementation packet, not an assignment to start before its dependency is accepted. The canonical JSON helper must first pass its M01 correction, independent review, integration and inverse proof. No second shared-schema writer is reserved.

## Scope

Implement the exact `Declaration`, `Scope`, `Content`, `ContextDeclaration`, `Anchor` and `Member` subset of ratified contract aede6ef2 / original ten-file manifest3b954ed6. Do not change the wire, fixtures, metadata version or existing producers/readers. This pure unit supports P2 O3, C02/C12/C14. It does not establish readiness, authentication, ancestry, actual content availability, create uniqueness or operation recovery.

Proposed entry: `pile-declaration-authority`. Planned unchanged verify: `pnpm vitest run src/data/contracts/pile-declaration.test.ts -t "pile declarations preserve immutable authority"`. This test does not exist or pass yet. The coordinator registers the entry, exact base SHA, worker identity and exclusive checkout only after the dependency closes.

Allowed source paths are two new files: `src/data/contracts/pile-declaration.ts` and `src/data/contracts/pile-declaration.test.ts`. Existing canonical JSON/hash code is read-only. No source consumer, Drive write, storage, Worker, screen, dependency, shared record or contract mutation is included.

## Observable contract

Expose a small asynchronous parser for source bytes plus the expected root ID supplied independently by the caller. Parse using the integrated strict JSON helper before validating closed shapes. Return a typed declaration on success and an explicit refusal without a value on failure. An expected root comparison is a scope check, not proof of authenticated access. Never derive the expected root from the input record. Unexpected platform errors propagate; recognized validation refusal needs no source text in diagnostics.

All properties in the normative type are required; omission and null are distinct. Reject unknown fields at every level, unsupported version/kind, wrong enum/discriminant and wrong types. Use exact logical-ID, opaque Drive-ID, lower-case hash, safe-number and Unicode rules. Preserve all text bytes without trimming or normalization. Names are single valid relative components; member origin is Unicode text or null. Content encoding, size and digest must have the ratified shape.

Enforce unique member keys, with no reuse of the context member key or folder create key. A loose declaration has exactly one member and absent context. A folder declaration has a member or nonempty original context; present-empty context remains valid when members exist. Context text requires utf8 content, independently matching UTF-8 byte size and raw-text SHA256, including CRLF, combining Unicode and present-empty text. Expected member hashes are declarations of intent; this unit must not assert that their bytes exist.

Return an independent decoded record and preserve supplied bytes. Reuse canonical hashing for identity; do not hash normalized text or include a self-hash. Keep legacy v1 files and other new record kinds outside this narrow parser, explicitly refused rather than partially interpreted. The later copy-resolution/reference unit will collapse canonical-identical copies and refuse conflicting logical identities; do not claim that this parser already resolves discovery conflicts.

## Test-first evidence

Commit a loadable API stub before adding the named assertions. First capture actual assertion reds with the stub retained; load/import failures do not count. Independent positive inputs come from the declaration portions of ratified fixtures01,07,08,09 and independently authored empty-context/context-only cases. Their admission/create/reselection events remain unexecuted by this unit.

Negative cases cover every nested unknown/missing/wrong field, unsafe numbers, decoded duplicate JSON keys, invalid UTF-8/Unicode, scope mismatch, invalid IDs/hash/name, repeated or colliding keys, loose/folder layout contradictions and context encoding/size/raw-hash mismatches. Add boundary controls for opaque IDs with punctuation, 1024 UTF-8 bytes, empty versus absent context and exact whitespace/CRLF. Assert no authoritative value on refusal and unchanged source bytes. Literal expected identities must be independent of the implementation under test.

Run the unchanged verify and full `pnpm check`. Preserve failures and the actual command timeline. Return separate stub/fix SHAs, clean candidate, exact changed paths, immutable report and artifact hashes. The worker does not close entries or update shared records. Fresh independent review precedes root integration; final-fix-only inverse proof must restore the loadable stub with all tests retained. No browser/provider access or P3 work is authorized by this packet.
