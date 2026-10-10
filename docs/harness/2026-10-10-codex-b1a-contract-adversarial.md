**B1a-contract adversarial review**

Verdict: **BLOCK** — `claude/p3...62125297`

1. **Blocking — cursor advances past changes absent from its state.**  
   `runner/src/index.ts:52`, `:78`  
   Edit an indexed note after the planner’s cached listing, before the feed read. Maintenance consumes that change but reuses the old version and summary. Through `main`, the run reached done with stale state; the committed cursor no longer returned the edit.

2. **Blocking — ordinary personal hubs still accept non-link edits.**  
   `src/data/contracts/note-edit.ts:891`  
   A person’s `Resources/Gardening/Gardening.md` is recognized as a hub by VaultIndex, but lacks `type: hub`. The new guard misses it. A consented Timeline append passed the author, recheck, and real runner effects, changing the unmarked hub contrary to Q1.

3. **Blocking — previously valid stored manifests become unreadable.**  
   `src/data/contracts/note-edit.ts:892`; `src/data/contracts/run-manifest.ts:499`  
   An old manifest records a satisfied append on a personal `type: moc` note. Its parser proves satisfaction by calling the current author. The new refusal replaces the expected `unchanged` result. Identical manifest bytes passed with the base author and failed at HEAD with `reason: shape`, breaking recovery and historical completion reads.

4. **Blocking — valid longer ownership/2 notes fail maintenance.**  
   `runner/src/index.ts:80`  
   Bootstrap or refresh a valid ownership/2 note longer than 4,096 bytes. Maintenance sends its prefix to the full-note parser, which rejects the truncated frames. A valid 9,198-byte note reproduced this through `main`: the run reported failed and committed no refreshed state.

5. **Blocking — newly discovered hidden descendants count as visible changes.**  
   `runner/src/index.ts:64`  
   After the cached listing, Obsidian creates `.obsidian/workspace.json`. Its id has no cached path, and its basename lacks a dot, so the fallback admits it. A hidden-only probe through `main` scheduled `maintain` and rewrote index and retrieval, violating the hidden-path addendum.

**Minor / v1 limits**

- `runner/src/claude.ts:1305`: selection accepts outside ids and paths inside `asks`; selection wiring remains B1d.
- `runner/src/claude.ts:1325`: a new-subfolder selection grants its parent folder/hub as targets; destination authority needs B1d resolution.
- `runner/src/index.ts:96`: account identity defaults to the folder id; validation checks only folder binding.
- Mechanisms: recovery and storage reuse existing homes; finding 5 introduces a second, incomplete hidden-path rule.

Verification used in-memory probes, including production `main`; no files were edited and no network was used.
