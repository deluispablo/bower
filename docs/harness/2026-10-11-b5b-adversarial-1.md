# B5b adversarial pass 1 (Astra high, attempt 8)

- **Blocking: data safety — [scripted.ts:1930](/private/tmp/bower-b5b-tables/src/data/spine/scripted.ts:1930).** Classified Sources lose immutability. Create a Source with row `offer`, then submit a `timeline-append`. It succeeds and changes the note because `applyChanges` checks `type: source`, while creation now writes `type: offer`. The identical unclassified Source correctly refuses with `unsupported`.

- **Blocking: data safety — [scripted.ts:2169](/private/tmp/bower-b5b-tables/src/data/spine/scripted.ts:2169).** Stored declarations can be erased during an unrelated run. With a `lease` row declaring `table: ["e","d","c","b","a"]`, the reader rejects the row and the planner schedules its replacement with eight seeds. The approved behavior is to display the first four columns. The corresponding screen fixture supplies only four, missing this case.

- **Blocking: data safety — [scripted.ts:2168](/private/tmp/bower-b5b-tables/src/data/spine/scripted.ts:2168).** Rewrites corrupt unknown stored values. Given a valid table containing `"future_id":9007199254740993`, request `Show b in the lease table.` The resulting write contains `"future_id":9007199254740992`. Parsing and reserializing the entire table violates preservation of unknown stored bytes.

- **v1 limit — [scripted.ts:558](/private/tmp/bower-b5b-tables/src/data/spine/scripted.ts:558).** Live proposal generation remains unwired. File novel lease material with spare proposal capacity: `modelDecisions` provides no `askAfter`, and the Claude reply schema carries no proposal payload. No proposal reaches admission; lifecycle tests inject this missing capability through their provider stub.

In-memory probes reproduced the three safety failures; boolean/text consent and option-refusal controls passed. No second parser, writer, loader or pending store found. The 99/97 pins and B4a helpers remain intact.

Full suites and e2e were not rerun; no files changed. The reproduced risks are unauthorized Source edits and stored-data loss.

verdict: BLOCK

Gates b5b-g1 and b5b-g2: green (check; e2e app, capabilities, folder-table on demo and fake).
