# Packet: worker-vault-pointer (P3-5)

Starting model: `bower-implementer` (Sonnet). Reason: adapting the original's template copy and folder check ([TL-P3-09](DECISIONS.md)); one Opus review covers P3-5. Starts after `worker-drive-token` is integrated (it uses `accessTokenFor` and the `folder_id` accessors).

- **Entry:** `worker-vault-pointer` (query `harness/features.json` with `jq`). Checkout `/private/tmp/bower-p3-vault`, branch `claude/p3-vault`, from the integration head after `worker-drive-token`. Never push or deploy, no real accounts or secrets.
- **Read:** `docs/harness/WORKER.md`, this packet, the contract (`POST /vault`, `DELETE /me`), `api/src/{drive-token,person,person-schema,auth,errors}.ts`, and from `/Users/deluisp/Projects/bower/api/src/`: `vault.ts`, `template.generated.ts` (how the template is generated: find its generator script and `vault-template/`), and `drive-api.ts` as needed.
- **Research first, cite:** Drive v3 `files.create` (folders, `appProperties`), `files.list` query syntax, idempotent creation (`files.generateIds` or a marker), and that `appProperties` are private to the OAuth client.
- **Acceptance contract:**
  - Stub-first: commit `api/src/vault.ts` signatures and failing tests first.
  - `POST /vault` (session required): if the stored pointer names a live folder, answer it with `found: true`; else look for the person's existing Bower folder by its Bower marker (`appProperties`, as the original) and answer `found: true`; else create the folder from the template (the five main folders, `Rules.md`, `About me.md`, `.bower/`) and answer `found: false`. Store only the pointer (`folder_id`). Safe to repeat: a retry after a lost reply never makes a second folder.
  - Never deletes or overwrites anything in Drive (only `files.create`; a test inspects every Drive call the fake records).
  - The template: generated from the repo's template source into `api/src/template.generated.ts` with a script and a check that it is current, as the original; synthetic content only.
  - Named tests: `vault makes a new Bower folder from the template`, `vault finds the existing Bower folder and says found`, `vault never deletes or overwrites anything in Drive`, plus a lost-reply retry case.
  - Files in scope: `api/src/**`, `api/test/**`, `api/scripts/**`, `api/package.json` (a script only), the template source if it must be added.
- **Gates:** the verify, `pnpm check`. Never write `harness/` records or run `done.sh`.
- **Deliver, under 15 lines:** commit SHAs (stub first), files, red→green, gates, sources, left out.
