# R1 content-write consumer inventory (no interface adoption)

Root read-only source inspection, 2026-10-05, contracts-2, integration f98cc59 / product1dc7f64. R1-D02 conditional premise is still under scratch preparation; no second actual provider result exists. This inventories consumers for a possible subsequent lead decision, not a product contract proposal or authorization to migrate them. Source hashes follow below.

## Existing boundary

DriveApi.readText(id) returns only a string. DriveFile metadata contains modifiedTime but no content-read token. writeText(id, nextText, ifModified) takes a timestamp string. DriveHttp does metadata GET then unconditional v3 media PATCH. The actual first R1 proves another client's write can land between those requests and be overwritten. Its unit positives/stale tests cover before-GET changes, not that interleave. FakeDrive awaits its admission gate, then compares modifiedTime and applies synchronously without an interleave between comparison and application; that behavior cannot establish the provider guarantee.

Neither WorkerApi.Me nor DriveHttpOptions supplies a new provider principal contract: current Me has user/folderId and options have token/fetch. Do not invent a wire field or infer stable backend authority from the app's local lifetime. Scope/token provenance needs an explicit lead decision. Content proof does not supply structural name/place atomicity.

## All content-write call sites

| Consumer | Current source location | Payload origin | Compatibility obligation if a conditional contract is adopted |
| --- | --- | --- | --- |
| Personal task toggle | src/data/vault/drive-vault.ts:330 | readText, then byte-preserving toggleTaskInText; expected timestamp from indexed file | Acquire the validator with exactly the read bytes; preserve source bytes and visible task identity. A changed displayed/indexed version must not be blessed with a fresh validator. Keep conflict refresh and original-owner journal semantics. |
| Pile context edit | src/data/vault/drive-vault.ts:503 | person input; old context timestamp/index after stillAsSeen and context GET; structural changes can precede content write | A validator must represent the context version the person edited. Structural and content effects need separate authority/recovery; a later fresh token cannot justify stale submitted input. Preserve no-removal/no-rename on already-stale context controls. |
| Filed saved-link conversion | src/data/fake/fake-runner.ts:181 | source link bytes to generated note after filing | Bind original file identity/version and operation intent; no stale overwrite, duplicate conversion or loss of original provenance. Fake-only script remains separate from any actual P4 runner. |
| Link rewrites | src/data/fake/fake-runner.ts:212 | readText then rewriteLinks for changed path | Carry original read provenance through transformation; preserve all unrelated bytes. Recomposition on conflict must rerun the deterministic rewrite against authorized current input, not replay the old body. |
| Timeline addition | src/data/fake/fake-runner.ts:220 | parsed note read then whole-note serialize plus event | Conditional safety does not authorize whole-note ownership rewriting. Preserve pending protected grammar adoption and exactly-once event/recovery identity. |
| Rule wording/removal | src/data/fake/fake-runner.ts:233 | read existing Rules.md, compose retained + newly worded rules | Bind read to proposal, retain original wording/removals and reconcile unknown applied effects before another mutation. |
| Runner system JSON | src/data/fake/fake-runner.ts:322 | writeJson for request history, questions and hashes; prior reads happen through separate helpers | Carry the read version through each read/compose/write operation. Do not fetch a current token after composing an old JSON body. Preserve current valid v1 fixtures and separate authority for different files. |
| Fake run persistence | src/data/fake/fake-worker.ts:183 | last-run v1 from current run; existing file metadata found by listAll | Same logical run/attempt identity and truthful persistence/report barrier still need O3/O4. A token cannot replace run authority or cure swallowed write failure. Legacy reportless terminal fixture remains valid. |

The ninth rg match in src/features/files/file-actions.ts:156 is navigator.clipboard.writeText(url), not a Drive content mutation. New-file creation, metadata update, Bin and upload routes remain separate obligations.

## Required later discriminators, conditional on real support and lead adoption

A minimal data-layer read-with-token/write-with-token design must bind immutable provenance to original bytes, file, authorized principal/folder, content version and strategy. Legacy read-only clients can retain string reads. Timestamp-only writers cannot acquire a token for stale payloads or silently use unconditional fallback: explicit conflict or authorized reread/recompose is required. No implicit timestamp-to-ETag cache. Test wrong-file/scope/token/body association, missing/weak/stale validators and a real compare/apply barrier; retain existing consumer controls above.

DriveHttp.call currently retries 401 once and non-POST 5xx plus rate-limit responses. A conditional PUT that applied but lost its response cannot be classified as an unapplied conflict solely because its retry sees a changed ETag. Mutation retry/unknown outcome therefore needs an explicit bounded reconciliation decision and observable effect identity. Missing 409/412-to-conflict mapping is another implementation obligation if the route is adopted, not an already-fixed behavior. Browser CORS/preflight and token privacy must be proved separately. No source or interface changes have been made by this inventory.

## Inspected source hashes

- `src/data/drive/drive-api.ts`: `e57343a528bb8ef72739b7277593f5b0f9caa569becbac7b4272c35b2bf27c6b`
- `src/data/drive/drive-http.ts`: `340134b45909b1f263a56942538447720e079a78ed9f4e170be6e9d25a7a8e21`
- `src/data/drive/drive-http.test.ts`: `d62b10f9eee2374eecfe67c632791ca28cb480974c751927f03d9892d659b95e`
- `src/data/drive/fake-drive.ts`: `0438820862bc60c464c790a42fe541736f1575c397197fef60f2a9499ad655c7`
- `src/data/drive/drive-contract.ts`: `5149cef509b3b7099fc10ae171099ae11e30b71024918662dba29baccf352602`
- `src/data/vault/drive-vault.ts`: `677783824f07e10aaa1089e3c9c152e9ad2280be862869eb046567747ff073c5`
- `src/data/fake/fake-runner.ts`: `80c86052a376705620431ff333017ce4cff65a2266605da7431ec7924c3dd396`
- `src/data/fake/fake-worker.ts`: `205a04dfeac3ea977b490857af32df2544d3a5e1268dcc4a1ea0a7c271c7d504`
- `src/data/worker/worker-api.ts`: `47122565b9b44759d313743cc698090c921c23af69a8273be2127ed12404e1ad`
