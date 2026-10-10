**B1a-contract adversarial review — pass 3, scoped**

Verdict: **BLOCK** — `baf0432d..3e11cec1`

**Blocking**

- `runner/src/index.ts:82`, `:89`: Bin `Resources/Gardening` before the planner lists it, with `Plot.md` already indexed. The folder and child are absent from the listing; the folder removal has no fallback path, so `cursorOnly` preserves stale state. Production `main` reaches done and advances cursor `17→18`, but retrieval and index still contain Plot. Both trashed metadata and metadata-free removed entries reproduce this. Missing test: containing-folder removal before listing.

**Minor / v1 limits**

- `runner/src/index.ts:105`: Full-note reads still record coverage as a 4,096-byte prefix.

The two scoped reds fail at the base and pass at HEAD in an in-memory harness. Goldens remain **88/99**. Existing assertions are unchanged; no second mechanism found.

Read-only, offline; no files edited.
