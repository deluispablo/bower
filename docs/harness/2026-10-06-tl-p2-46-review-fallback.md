# Technical-lead decision TL-P2-2026-10-06-46: when the other provider is unavailable

**Coordinator question, 2026-10-06:** the P2 batch review of frozen `4d7ab08` (about 6.5k lines) cannot run on Codex, which is out of usage until 2026-10-12 10:20. TL-P2-44 rule 6 asks for a review from the other provider.

**Ruling.**

1. **Fallback to the same provider, on the top rung.** When the other provider is unavailable, the review runs in a fresh `bower-escalated` (Opus) session. P2 does not wait for Codex. Buying Codex credits is the owner's choice, not a precondition. Opus, not Sonnet, because this is the phase-exit review over contract and data-safety code, which TL-P2-42 assigns to Opus.
2. **Countering self-preference.** Models rate their own output more favourably ([Panickssery et al., 2024](https://arxiv.org/abs/2404.13076)). Same-model review also caught fewer real bugs than cross-model review ([Greptile, 2026](https://greptile.com/blog/model-inversion)). The fallback review therefore:
   - reads only the packet, the acceptance contract and the diff, never the implementers' deliveries or reasoning;
   - is told to assume the code is wrong until a test or a reading proves otherwise;
   - for each Critical or Important finding, names the failing scenario and the missing or weak test.
3. **No automatic re-review.** When Codex is back, it does not re-review `4d7ab08`. Codex resumes as reviewer from the next entry. A Codex delta review of P2 happens only if the owner asks for it.
4. **Parallel evaluation is approved.** The phone/desktop evaluation of `4d7ab08` runs alongside the review, keeping the two-worker limit (TL-P2-38).
