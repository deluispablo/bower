# Technical-lead decision TL-P3-2026-10-06-05: the Worker's general error codes

**Coordinator question, 2026-10-06:** the Worker contract named only `no-folder`, `nothing` and `stale-session`. The Worker also emits seven general codes, held in a visible `PENDING_CONTRACT_CODES` list.

**Ruling.** The [Worker contract](../specs/2026-10-04-worker-contract.md) gains a table of general codes: `signed-out` (401), `forbidden` (403), `not-found` (404), `payload-too-large` (413), `unsupported-media-type` (415), `rate-limited` (429) and `internal` (500). Each has one sentence for the person.

- **`signed-out` is added** so that every error answer has a code. The app keeps deciding 401 by its status, so this is compatible.
- **`config` is refused as a client-facing code.** A 500 never says which key or secret is missing; that detail goes to the Worker log only, and the client gets `internal` ([OWASP error handling](https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html)).
- **The fix round** maps `config` to `internal` and empties `PENDING_CONTRACT_CODES`. The codes test then reads the allowed list from the contract table.
