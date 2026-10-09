# Codex adversarial pass: c4-parse-once (TL-P4-29 ruling 2, session 3)

Read-only, medium effort, scope `git diff claude/p3...c4-parse-once`. Tokens: {"input_tokens":410354,"cached_input_tokens":350208,"output_tokens":1984}.

Important — `src/data/spine/scripted.ts:370`: fetched pile notes bypass the attempt memo. With one unchanged `Pile note.md` in an inbox pile, `runTidy` parses it in `listedPiles` (`plan.ts:473`), then again in `capturePiles` (`plan.ts:188`). Neither receives `opts.context`, so the same `(fileId, SHA-256)` is parsed twice. The fake path likewise parses through `DriveVault.piles` before capture. Breaks contract items 1 and 4: at most one parse per fetched key and identity/context threaded to each parse site. The red checks only the two hub IDs, leaving these fetched-note parses outside its assertions.

findings: 1
