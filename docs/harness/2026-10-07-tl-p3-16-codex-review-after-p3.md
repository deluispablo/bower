# Technical-lead decision TL-P3-2026-10-07-16: P3 closes on the Opus fallback; Codex reviews before P4

**Owner decision, 2026-10-07 (option A).** Codex is out of usage until 2026-10-12 10:20, and P3 is forecast to finish before then.

- **P3 does not wait for Codex.** The P3 exit item "one cross-provider review covers the Worker, the spine and the real adapters" is met by the [TL-P2-46](2026-10-06-tl-p2-46-review-fallback.md) fallback: a fresh `bower-escalated` session that reads only the packets, the contracts and the diff, and assumes the code is wrong until proven otherwise.
- **One Codex review before P4 starts,** once Codex is back on 2026-10-12. It covers the P3 range of `api/` (the Worker) and the spine and runner code, against the [Worker contract](../specs/2026-10-04-worker-contract.md) and the P3 acceptance. It runs on medium effort, as one review with no rounds, with only Critical and Important findings reported. A finding is fixed as a P3 follow-up entry before P4 work depends on that code. Same-model review misses more of these ([Greptile, 2026](https://greptile.com/blog/model-inversion)), and this is the data-safety and concurrency code that real use will rely on.
- **Before it runs,** the lead checks that `codex exec` answers. The CLI is installed and logged in, as of 2026-10-07.
- **The coordinator** resumes Codex as the reviewer of Claude's entries from the first entry after 2026-10-12 (TL-P2-44 rule 6).
