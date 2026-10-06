# Independent review resel-review-1: pile-member-reselection

Target `/private/tmp/bower-p2-reselection`, base `c43a675` → test `4dd2936` → fix `0d410bb` (reviewed); the branch then gained TL-P2-27 work `a1b910a`/`00cebc0` and the qa26 update `8a9f485`, to be reviewed as a delta. **Verdict at `0d410bb`: BLOCKED — 0 Critical, 3 Important, 5 Minor.** Reds genuine; reviewer ran 183 tests. Passes: size then sha256 match (links via canonical .url bytes), sent once under the declared member, siblings never resent, mismatch refused with nothing sent, another-device recheck, tidy-up refusal at entry, queue replaces a gone entry keeping record/reserved ID/session (no second file; no resurrection of discarded/tombstoned items), session fence waits, readiness states.

Important: I1 send loop can spin when refresh() fails mid-send (`drive-vault.ts:1068-1072` with `1086-1089`); I2 Try again always targets the first missing file and refuses a different missing member (`PileScreen.tsx:143-162`); I3 missing links and Inbox Try again were dead ends at `0d410bb` (TL-P2-27, addressed by `00cebc0`).

Minor: double pick can make a second Drive file on the direct path; tidy-up check-then-act; queue trusts the caller's hash; picker skips this page's failed sends; undeclared gone items not listed (pre-existing).
