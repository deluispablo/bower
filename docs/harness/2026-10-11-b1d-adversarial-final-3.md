# B1d adversarial pass 3 (Codex gpt-6-astra xhigh, read-only) on b54e2a86

- **Important — Blocking: normal use — [claude.ts:1365](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1365):** A valid 4,918-byte `ownership/2` Source note with a region crossing byte 4,096 makes an unrelated offer run fail before either model call: “This note cannot be read safely.” The 918-byte control completes. Only MOCs bypass parsing truncated prefixes as complete notes.

- **Important — Blocking: normal use — [timing.ts:90](/private/tmp/bower-b1d-selection/runner/src/timing.ts:90):** Cold discovery with 180 short archive notes exhausts the ledger, but queued reads continue after `maintenanceDepth` drops to zero. Through `main`, archive-note reads alone total **357 sends**, including **61 uncharged sends after exhaustion**. The run reports done despite exceeding the 300-send cap.

- **Important — Blocking: normal use — [claude.ts:1377](/private/tmp/bower-b1d-selection/runner/src/claude.ts:1377):** Two admitted requests name three distinct notes each: Alpha/Beta/Gamma and Delta/Epsilon/Zeta. Each selection requests only its own three, yet every source inherits all six request pins. Both selection attempts are rejected; `main` returns code 1 without execution. The single-request control completes.

- **Important — Blocking: normal use — [model-input.ts:25](/private/tmp/bower-b1d-selection/runner/src/model-input.ts:25):** Equivalent runs containing a MOC and one member produce different fingerprints when fresh ids differ. Through `main`, changing only physical ids produced `0e3fadae450a` versus `964796428cbc`. The first normalized difference is `members:["f12"]` versus `members:["f22"]`; these references escape normalization.

No second planner, cache, ledger, writer or pending store found. No unauthorized assertion weakening found across sweeps 3–6. The cache handoff probe returned fresh bytes; fabricated ids, excess wants, invisible parents and unselected writes were refused.

The prefix and budget findings trigger addendum 22’s re-plan guard.

verdict: BLOCK
