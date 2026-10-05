# O1 current synthetic reproductions

Revision `2026-10-05-contracts-2`; immutable target `143ae2b12d5440330bee1a85bd16e90b8dccf746`, 2026-10-05. Coordinator replayed the unchanged archived script with Node 26.10.0 and repository TypeScript 6.0.3 after the adoption baseline check passed (398 tests).

Copy `probes.cjs.txt` to a temporary `.cjs` file and run `node <script> <frozen-checkout> <frozen-checkout>/node_modules/typescript`. The script creates only synthetic in-memory stores and Drive data. A successful process exit means observations were recorded, not that these behaviors passed.

Observed: remote text/tree remained stale after status polling; a paragraph in Current state let a protected task be toggled; a failed pile member disappeared while the run reported done; an older reading reply replaced a newer done observation. Expected outcomes are specified in the four qa-13 backlog entries. The upload error in the log is intentional fault injection. These are local app/fake observations, not real Drive concurrency or service durability evidence. Named regression verifications are planned until implemented and closed through the harness.
