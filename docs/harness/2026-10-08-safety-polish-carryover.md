# safety-polish: superseded (TL-P4-14 addendum 3)

`safety-polish` is closed as superseded ([TL-P4-14](2026-10-08-tl-p4-14-consolidation.md) addendum 3, main 03f20c6). Every item sits in a mechanism a later stage rebuilds, so it becomes a named acceptance test in its owner's packet instead of a patch now. The coordinator copies each row into the owner's packet when it registers the entry.

| # | Item (from P2_POLISH or DEFECT_LOG) | Owner entry | Acceptance test to name |
| --- | --- | --- | --- |
| 1 | A pile left with only its words says "Some of its things have not arrived yet" (defect words-only-pile-copy) | `c4-run-view` | a words-only pile never says its things have not arrived |
| 2 | A refused Bin still closes the question keyed by its hash (scripted.ts:497) | `c3-subject` | a refused Bin keeps its question open |
| 3 | KEEP_CHANGED says "both notes stay" when the person moved or binned the other note | `c3-pair-ask` | keep-one says what happened when the other note moved or was binned |
| 4 | A failed run-end start is silent, and a retry still says "waits" (person.ts admitSync/startWaiting) | `c2-worker-dispatch` | a failed run-end start says so, and a retry does not claim it waits |
| 5 | TidyButton, StatusBar and Palette ignore usePiles().error | `c4-resource` | every screen that reads piles shows its error |
| 6 | An answer line whose question's thing left stays pending in the journal | `c3-subject` | an answer whose subject left is settled, not left pending |
| 7 | A landed move that the person then purged is reported as set aside, not applied (runner/src/effects.ts:268) | `c2-one-engine` | a landed move later purged is reported as applied |
| 8 | The start-fails fake scenario shows in the demo panel, but the demo ignores it | `c4-resource` | every scenario the demo panel lists changes what the demo shows |
