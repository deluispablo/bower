# Spike: semantic search over the vault (#51)

Goal: find notes by meaning, not only by word match. Depends on #34 (Drive
full-text search), already shipped in `app/src/search.ts` and
`app/src/components/search.tsx`: the app runs Drive's `fullText contains`
directly from the browser with the user's own Drive token, narrowed
client-side to files already in the vault index. It is lexical only.

## 1. Index size

500 notes × ~600 words ≈ 780 tokens/note (≈1.3 tokens/word). Chunked at
~300 tokens/chunk → 3 chunks/note → **≈1,500 vectors** for the vault.

Bytes per vector (raw floats, no per-vector overhead):

| Dimensions | float32 | int8 (quantised) |
| --- | --- | --- |
| 384 | 1,536 B | 384 B |
| 768 | 3,072 B | 768 B |
| 1024 (bge-m3 native) | 4,096 B | 1,024 B |

Total file size for 1,500 vectors, vectors only:

| Dimensions × precision | Total |
| --- | --- |
| 384-dim int8 | ≈0.55 MiB |
| 768-dim int8 | ≈1.1 MiB |
| 384-dim float32 | ≈2.2 MiB |
| 768-dim float32 | ≈4.4 MiB |
| 1024-dim float32 | ≈5.9 MiB |

Chunk metadata (note id, chunk index, char span for a snippet) adds well
under 100 KiB at this scale, stored as a compact side table, not inline
note text. Storing the vectors themselves as JSON number arrays instead of
a binary buffer roughly 4–6× the size (each float becomes ~15–18 ASCII
bytes) — `.bower/index.bin` should be a raw `Int8Array`/`Float32Array`
buffer, with a small `.bower/index.json` (or fixed-width binary) sidecar
for the offsets.

For a phone: even the largest realistic option here (~4–6 MiB, fp32,
768–1024-dim) is a one-time download, cacheable by the existing service
worker (`app/src/sw.ts`) the same way the app shell already is, and
re-fetched only when Drive's `modifiedTime` on the file changes — the same
pattern the vault index cache already uses. The recommended int8/384-dim
choice (~0.55 MiB) is trivial on any connection. A 5,000-note vault scales
this ~10×: ≈5.5 MiB int8/384-dim, still fine; ≈44–59 MiB fp32/1024-dim
would start to be a real mobile download for no quality gain over int8 at
any of these sizes.

## 2. Embedding providers

**(a) Local model in the GitHub Actions runner, at ingest**

`all-MiniLM-L6-v2` (`Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers`,
the maintained successor to `@xenova/transformers`) is 384-dim and a
quantised ONNX download of ≈23 MB — but it is English-centric and weak on
Spanish, which this vault needs. A multilingual model of the same class
fits instead: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384-dim,
118 M params, 50+ languages including es/en) or `intfloat/multilingual-e5-small`
(384-dim, 94 languages, ≈449 MB fp32 / ≈113 MB int8-quantised ONNX).
Either lands at roughly 110–130 MB quantised, a one-time download cached
with `actions/cache` exactly like `rclone` and the Claude Code CLI already
are in `agent/workflows/ingest.yml`, keyed by a pinned model revision.

Runtime on the free `ubuntu-latest` runner (2 vCPUs, CPU only): encoding one
~300-token chunk with a ~100–120 M-parameter MiniLM-class model is on the
order of tens to low hundreds of ms. A cold full backfill of 1,500 chunks
is roughly 2–5 minutes; comfortably inside the 20-minute per-run cap
(`ARCHITECTURE.md` → Limits). Ordinary runs only touch the files
`run.sh`'s own pending-list already isolates (new/changed notes in
`0-Inbox`/`Clippings`, plus whatever the agent itself edits) — typically a
handful of chunks, so the added time per normal ingest run is seconds.
Added Actions minutes stay a small fraction of the instance's 2,000
free minutes/month; the model download is cached, not re-paid every run.
Nothing here talks to the Worker or leaves the runner/Drive boundary.

**(b) Cloudflare Workers AI, free tier**

10,000 free "Neurons"/day per account, resetting at 00:00 UTC and shared
across every Workers AI call the account makes
([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).
`@cf/baai/bge-small-en-v1.5` costs 1,841 neurons/M input tokens but is
English only — wrong for this vault.
[`@cf/baai/bge-m3`](https://developers.cloudflare.com/workers-ai/models/bge-m3/)
costs 1,075 neurons/M input tokens, is multilingual (100+ languages
including es/en), and outputs 1024-dim vectors. A full 500-note backfill
(~390,000 tokens) costs ≈420 neurons, about 4% of one day's free pool;
incremental runs cost far less. Free at this vault size.

Workers AI also has a plain REST inference endpoint reachable with a
Cloudflare API token from anywhere, so the runner could call it directly —
the same way it already calls the Worker with `BOWER_API_KEY` and Anthropic
with a Claude key — without routing through `api/`'s own Worker code. That
technically keeps the letter of "Worker keeps credentials and pointers,
never content" (that rule is about this repo's Worker component), but it
still sends note text to Cloudflare's inference API: a second
content-processing third party beyond Anthropic that `docs/privacy.md`
does not disclose today ("nothing else leaves your Drive, and nothing is
sent anywhere else"). Its 1024-dim vectors are also the largest and most
expensive option in §1 for no quality gain at this scale.

**(c) Drive full-text search only (#34), improved**

Already shipped, 0 € running cost, 0 new third parties (Drive already
holds the content). It is lexical: `fullText contains` matches literal
words/stems, so a query for "car" will not find a note about "vehicle".
Better ranking, wikilink and frontmatter-tag matching would sharpen word
search, but cannot close that gap — this path does not answer "semantic
search" on its own.

**(d) Query-time embedding on the phone**

Needs a small model shipped to the browser, cacheable by the same service
worker that already caches the app shell. The English-only MiniLM model is
a ≈23 MB download; a multilingual model to match this vault's Spanish and
English notes is heavier — ≈90–130 MB quantised for
`paraphrase-multilingual-MiniLM-L12-v2` or `multilingual-e5-small`. That is
a real one-time download on a phone, though cacheable and paid only once.
`transformers.js` (`@huggingface/transformers`) runs in-browser over WASM
(`onnxruntime-web`) or WebGPU; a single short query through a
~100–120 M-parameter model on a phone CPU (WASM) is roughly hundreds of ms
to a couple of seconds — usable for an interactive search box, not
instant. WebGPU would be faster, but iOS Safari support is inconsistent,
so WASM has to be the baseline. This only produces the *query* vector: it
still needs a precomputed index of *note* vectors from (a) or (b) to
compare against — an addition on top of one of them, not a replacement.
Paired with (a), it keeps every embedding — note and query — inside the
user's own Drive and device, with no third party at all.

## 3. Privacy

| Option | Note content leaves Drive to | `docs/privacy.md` change |
| --- | --- | --- |
| (a) local runner model | Nowhere new | None |
| (b) Workers AI | Cloudflare, beyond Anthropic | Yes — rewrite the "nothing else leaves your Drive" line, review the Google API Services Limited Use disclosure |
| (c) Drive full-text only | Nowhere new | None |
| (d) phone query-time | Nowhere, for the query itself | Inherits whichever provider built the index it searches |

## 4. Multilingual (operator's users write Spanish and English)

| Model | Dims | Languages | Size (quantised) | Fit |
| --- | --- | --- | --- | --- |
| `all-MiniLM-L6-v2` | 384 | English-centric | ≈23 MB | No — weak Spanish |
| `bge-small-en-v1.5` (Workers AI) | 384 | English only | n/a (hosted) | No |
| `paraphrase-multilingual-MiniLM-L12-v2` | 384 | 50+, incl. es/en | ≈110–130 MB (est.) | Yes |
| `multilingual-e5-small` | 384 | 94, incl. es/en | ≈113 MB | Yes, needs a `query:`/`passage:` prefix convention |
| `bge-m3` (Workers AI) | 1024 | 100+, incl. es/en | n/a (hosted) | Yes, if (b) is chosen |

## 5. Recommendation

**Build the index locally in the runner, with a small multilingual model.
Do not use Workers AI. Do not close #51.**

Cloudflare Workers AI is free enough at this vault size, but it fails the
"no new third party beyond Anthropic" bar for no benefit: the local model
is also free, faster to iterate on (no account/token to provision), and
needs no `docs/privacy.md` change. Drive full-text search alone does not
satisfy the issue's goal (it is not semantic). Local embedding with a
multilingual model satisfies the goal at 0 € with no new privacy exposure.

Plan:

1. Add `agent/embed.mjs`, a Node script using `@huggingface/transformers`
   with `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384-dim, es+en,
   simpler than e5's prefix convention). It chunks each pending/changed
   note at ~300 tokens, embeds, int8-quantises, and merges the result into
   `.bower/index.bin` (vectors) plus a small sidecar (chunk → note id,
   offsets) sitting in the vault like any other file — no vault content
   ever in this repository.
2. Wire it into `agent/run.sh` after the agent step, using the same
   `STEP`/`fail()` reporting it already has, and cache the model in
   `agent/workflows/ingest.yml` with `actions/cache`, exactly as `rclone`
   and the Claude Code CLI are cached today.
3. In the app, bundle the same (or a smaller) model behind the service
   worker's cache; add a "search by meaning" path in `search.ts`/
   `search.tsx` that fetches `.bower/index.bin` once (conditional on
   Drive's `modifiedTime`, like the vault index cache already is), embeds
   the query in the browser, and ranks by cosine similarity — offered
   alongside the existing full-text results, not silently replacing them.
4. Unit-test the pure functions (chunking, quantising, cosine similarity,
   index (de)serialisation) with fixture vectors; no real model load in
   CI, matching the existing stubbed-`rclone`-and-`claude` smoke-test
   style (`agent/test/smoke.sh`).
5. Run the manual quality checklist in `docs/testing.md` against a real
   bilingual vault before calling the feature done.

Cost at 0 € constraint: the model download is one-time and cached; added
Actions minutes are seconds per ordinary run (low single digits only for a
cold full backfill), a small fraction of the existing 2,000 free
minutes/month. No new paid service, no new third party, no server —
stays at 0 €/month.
