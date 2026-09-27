# Vault template

The vault every new user starts from, copied into their own Google Drive; see `ARCHITECTURE.md`. This `README.md` is not copied.

## Three files, three owners

| File | Owner | Who writes it |
| --- | --- | --- |
| `CLAUDE.md` | Bower | Only this template. Its frontmatter carries `bower_rules_version`; the agent may never edit it (the runner's protected paths), and the app replaces it whole from Settings › Advanced › "Update Bower's rules" when the template is newer. |
| `Rules.md` | The user | The Instructions workflow (permanent rules the user asked for). Read by every run; wins over `CLAUDE.md` except for its protected-path rules. |
| `About-Me.md` | The user, with the agent's help | The agent, whenever it learns something lasting about the user (Ingest step 7). |

The agent reads them in that order: `CLAUDE.md`, then `Rules.md`, then `About-Me.md`.

## Changing the rulebook

Any change to `CLAUDE.md` that existing vaults should receive bumps `bower_rules_version` by one. The app compares the vault's number with the template's (compiled in at build time) and offers the update when the vault is behind. A vault whose `CLAUDE.md` has no `bower_rules_version` counts as version 1, the rulebook from before the split: the update also moves the user's own additions into `Rules.md`: the lines of its `## Rules` section, then, under `## Migrated from your old rulebook (v1)`, every section this template has no heading for and the lines a shared section (`## Tags`) has that this template lacks. The update recognises a line as Bower's own when this template has it or an earlier version did: whenever you remove or reword a line here, add the old line to `app/src/rulebook-retired.ts` in the same PR, or old folders would get it copied into their `Rules.md` as if the user had written it. Never reuse the `## Rules` section for anything the user writes.
