# Codex pass: c4-create-landed (TL-P4-23 ruling 6)

Read-only, medium effort. Scope `b2b815a8..cbf9be5f` in /private/tmp/bower-c4-create. Prompt: the packet's contract, Critical and Important only. The P4-61 Claude review passed the same range. Tokens: input 452747 (cached 375680), output 2536.

## Findings (verbatim)

1. **Important — `src/data/spine/write-once.ts:201`: recovery compares against the retry’s recomputed name, losing the original create intent.** Create `Resources/Cooking/Untitled.md`, lose both the answer and recovery read, then call `vault.refresh()`. Retry the same create. `drive-vault.ts:368` now chooses the next free name because the original file is listed. `asMade` compares the recovered file against that new name and throws `CHANGED_ELSEWHERE`, although nobody changed it. The refusal releases the reserved id; another retry creates a second copy.

   **Mechanism home violated:** `spine/write-once.ts` must judge `landed` against the name and place originally sent with the reserved id. Keep that intent across retries. This makes a recoverable lost answer a permanent refusal outside the accepted journal exception.

findings: 1

## Fix round 1 pass (scope 666c5a82..65844336)

Read-only, medium effort. Tokens: input 375931 (cached 318080), output 1072.

findings: 0
