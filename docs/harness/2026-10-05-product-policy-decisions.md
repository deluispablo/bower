# Owner product decisions — 2026-10-05

Planning revision: `2026-10-05-contracts-2`; P2. Coordinator `p2-orchestrator-2026-10-05-01a10bbd` records owner decisions without changing main planning or claiming implemented behavior.

## Provenance

The actual human turn `01a10cf5-e5bb-74f1-ad34-1fc364376bda` in **Planificador** (`01a10b2a-e851-7bc2-b49f-8845262acfdb`) approves the recommendations and entrusts technical judgment to the lead. Root read that human turn and its preceding recommendations directly. The lead delivered the bounded interpretation to this implementation chat. This supersedes earlier pending-policy statements while preserving their historical evidence. Receiving a message does not authorize root to send a return message to another user-owned chat.

## D01 — Offline reading

Approved: read notes previously saved on the device. Show whether a note is available offline and that it may be stale. Disable editing until connectivity returns; no offline-edit queue is authorized. Preserve account/folder isolation and device cleanup on sign-out. Cached PWA shell proof alone does not satisfy note-reading acceptance. Implementation, failure/storage/cleanup tests and independent evaluation remain pending (C01/C03/C14/C16).

## D02 — Pending uploads after reload

Approved: retain pending file bytes locally where supported; if unavailable through quota, denied storage, closure or eviction, request reselection and verify identity/content. Preserve completed members, prevent duplicates and refuse processing an incomplete pile. Never promise unconditional browser persistence or move a draft to another account/folder. Sign-out device cleanup and original-folder journal outbox remain governed by their existing distinct contracts. Matching implementation, durable readiness, byte/reselection/recovery tests and independent evaluation remain pending (C02/C12/C14/C15/C16).

## Existing-resource permission

Reuse of `LEGACY_PROBE_REPOSITORY`, `GOOGLE_P2_PROJECT`, `GOOGLE_TEST_ACCOUNT_A` and `LEGACY_APP_ORIGIN` is owner-authorized for bounded P2 premise probes. Real bindings remain private and unversioned. Prepare OAuth/Drive setup and synthetic isolated roots, and a separate no-model executor workflow. Preserve live redirects, audience, grants, personal content and production workflows. No new spend, old tidy-up invocation, immediate production replacement, product push/deployment or P3/P4 implementation is authorized. Consent/tokens and R1–R4 runtime observations are still absent; tool-required action-time confirmations still apply to actual access expansion. Request only the specific interactive login/consent or genuinely missing secure client export when the prepared procedure reaches it.

## Acceptance remains open

These decisions resolve policy inputs; they do not approve a new ownership grammar, certify provider safety or accept P2. Lead grammar/raw-adapter/activation decisions and complete capability/probe/gate/independent-evaluation evidence remain required before the owner reviews phase closure.
