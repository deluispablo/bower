# Immutable declaration guard candidate

Role: Codex `/root/declaration_implementer`, sole assigned implementer, entry `pile-declaration-authority` / qa21, P2 O3 C02/C12/C14. Planning `2026-10-05-contracts-2`, matching local main `10ca886626206e0d4d880d6679dd4f57adcafcee`. Skills: bower-session and bower-implement; implementer brief and startup followed. Native shell/Git/Node v26.10.0/pnpm 12.8.1 available. Browser/provider/network/private credentials/delegation not used or authorized.

Checkout `/private/tmp/bower-p2-declaration-guards`, branch `codex/p2-declaration-guards`. Clean assigned base `87cafb7c3317d0a15f2b1a41fe9802117c3fc920`. Current integration ACTIVE and bounded B2 packet governed this replacement assignment; original writer was explicitly stopped with no init/code/test. Root shared records/source remained read-only. Canonical dependency proof `dd7909b`; ratified B contract `aede6ef2` / original ten-file manifest `3b954ed6`, TL04/05 unchanged.

Separate loadable stub: `b20c6187602a046746852cd145c67b9806e16b9a`.
Final fix candidate: `4052532b482e69f5945e19fc3aaba7f4fbbfff3d`.
Exactly two changed paths: `src/data/contracts/pile-declaration.ts` and `src/data/contracts/pile-declaration.test.ts`. Final checkout status is clean (empty clean-status.log). The stub was committed after the initial blocked baseline, before the recovered stub check; it was not claimed to have been gate-green at that initial commit. Final fix was committed after full green check and unchanged named verification.

## Result and limits

`parsePileDeclaration(bytes, expectedRootId)` asynchronously returns `{ ok: true, value: Declaration, sha256 }` or `{ ok: false, reason }`, with neither value nor identity on refusal. The digest is the existing canonical helper's hash of the entire validated declaration, without a self-hash. Expected root must be independently supplied by the caller; the comparison is a scope check, never authentication.

The exact closed Declaration/Scope/Content/ContextDeclaration/Anchor/Member subset validates required versus null fields, kinds, Unicode, logical IDs, opaque Drive IDs bounded to 1024 UTF-8 bytes, single-component names, lower-case hashes and nonnegative safe integers. The coordinator explicitly confirmed the ratified C0+DEL mask; U+0080/U+009F stay allowed in names/opaque IDs with positive byte-preservation controls. No new C1 restriction or wire field was adopted.

Unique member keys remain distinct from context and folder create keys. Loose declarations require one member and absent context. Folder declarations require members or nonempty original context; present-empty text remains valid with members. Context content must be utf8 with size and SHA256 of its exact original UTF-8 bytes, preserving CRLF, whitespace, Unicode and empty text. Member content digests remain intent, without invented byte availability. Decoded objects are independent on repeated parse, source byte views are unchanged, and unexpected platform hash failures propagate.

Tests independently author expected declaration portions for fixtures01/07/08/09 and use literal authoring SHA256 identities. Local raw-text hashes were computed independently using Node crypto before entering literals; the implementation uses the existing platform hash helper. Named coverage has330 cases: all nested unknown/missing/wrong fields, invalid numbers/IDs/names/hashes/enums/layout/key collisions, duplicate decoded JSON keys, Unicode/UTF8 failures, scope mismatch, context raw binding, explicit absences/empty/context-only controls, and independent results/platform errors. Fixture admission/create/reselection/recovery events were NOT EXECUTED. Individually valid conflicting declaration copies parse independently; discovery conflict resolution is outside this parser.

No producer/consumer, I/O, shared schema dependency, storage, UI, provider, runtime readiness/authentication/ancestry/create uniqueness/CAS/report publication/recovery implementation or capability closure is claimed. No shared records or harness passes/proofs were edited; no done.sh, push or deployment was used. Independent review and root integration/final-fix inverse closure remain pending. This report is implementation evidence, not self-review or acceptance.

## Actual command chronology

All checks ran in the exclusive assigned worktree; all logs here preserve actual output including failures. No package, lockfile or configuration change was made.

1. `pnpm_config_offline=true pnpm_config_verify_deps_before_run=false bash harness/init.sh` — exit1, log01. The ONE init's installer failed `ERR_PNPM_NO_OFFLINE_TARBALL` for `@babel/plugin-transform-shorthand-properties@7.29.7`. No gate in init ran. The failed installer removed copied executable links.
2. Separate `pnpm_config_offline=true pnpm_config_verify_deps_before_run=false pnpm check` — exit127, log02: ESLint command unavailable; tests/checks did not run. The coordinator restored a second independently copied dependency tree without hardlinks, preserving1918 relative symlinks. Original and restoration provenance files are included. The failed installation tree is preserved at `/private/tmp/bower-declaration-offline-init-dependencies`. No registry retries/repeated init/install occurred.
3. Loadable stub committed b20c618. Initial non-escalated Git index-lock write was blocked by the sandbox; authorized escalated Git succeeded. Tests were not committed or present for the recovered stub check.
4. `pnpm_config_verify_deps_before_run=false pnpm check` — exit0, log03: recovered STUB gate730 tests/55 files and all remaining gates green. This is not a successful initial install.
5. Add named assertions; unchanged `pnpm vitest run src/data/contracts/pile-declaration.test.ts -t "pile declarations preserve immutable authority"`, with `pnpm_config_verify_deps_before_run=false` — exit1, log04:90 assertion failures and240 passing controls,330 cases loaded. No import/load failures.
6. Implement minimal guard. Same unchanged verify/env — exit0, log05:330/330.
7. `pnpm_config_verify_deps_before_run=false pnpm check` — exit1 at lint, log06:20 errors in only the new paths (non-null assertions/dynamic delete in tests and control regex in module). No heavy test/build gate ran. Root's serialized gate reservation was observed before retry.
8. Correct lint without changing assertions; targeted eslint — exit0, log07. `pnpm typecheck`, same env — exit2, log08: TypeScript narrowing for initially object/kind-narrowed discriminant branches. Replaced that narrowing with a typed record guard, preserving shape behavior.
9. After root released its heavy gate reservation, `pnpm_config_verify_deps_before_run=false pnpm check` — exit0, log09:1060 tests/56 files and lint/typecheck/build/harness/bundle/landing green. Existing fast-refresh and bundle-size warnings retained; no weakening.
10. Preserve final source/test bytes; temporarily restore exact committed loadable stub only, keeping final tests. Same unchanged verify/env — exit1, log10:90 genuine assertion failures/240 controls with final tests (no load error). Restore exact final module bytes. This additional worker regression run does not replace root's independent final-fix inverse proof.
11. Same unchanged verify/env — exit0, log11:330/330. `git diff --check` — exit0. Final fix committed4052532 with only the two allowed paths.
12. Same unchanged verify/env on committed candidate — exit0, log12:330/330. Checkout clean. Candidate patch, stub/final source/test, commit/path/status records and provenance frozen in this directory; manifest SHA256 is returned separately to the coordinator.

All command logs are unmodified originals. Red logs contain NUL bytes from synthetic context cases; use text-safe reading or `rg -a` if inspecting them. Source snapshots equal the committed candidate. No unresolved implementation gate failure remains; initial installer/baseline/lint/typecheck failures remain explicitly preserved.
