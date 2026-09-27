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

Any change to `CLAUDE.md` that existing vaults should receive bumps `bower_rules_version` by one. The app compares the vault's number with the template's (compiled in at build time) and offers the update when the vault is behind. A vault whose `CLAUDE.md` has no `bower_rules_version` counts as version 1, the rulebook from before the split: the update also moves the user's own lines from its `## Rules` section into `Rules.md`. Lines in the `## Rules` section of this template are what the update recognises as Bower's own, so edit or remove existing ones only together with a version bump, and never reuse that section for anything the user writes.
