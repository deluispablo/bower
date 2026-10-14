# B8 ruled scripted evidence

- One event per applied primary operationId in the frozen monthly file; zero events for the rejected hub edit.
- No done report or retrieval completion before required health/log artifacts are confirmed.
- Health is updated once; report record, last-run.json and fixedReport preserve its one updated row.
- Source bytes equal the inbox fixture; hub bytes equal seed; create/move sends do not repeat.
- A deliberately landed retrieval write with missing health proof is insufficient for maintenance completion.

No model semantics or migration claim. TL-P4-50 supersedes the prep.
