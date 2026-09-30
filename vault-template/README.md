# Vault template

The vault every new user starts from, copied into their own Google Drive; see `ARCHITECTURE.md`. This `README.md` is not copied.

## Three files, three owners

| File | Owner | Who writes it |
| --- | --- | --- |
| `CLAUDE.md` | Bower | Only this template. Its frontmatter carries `bower_rules_version`; the agent may never edit it (the runner's protected paths), and the app replaces it whole from Settings › Advanced › "Update Bower's rules" when the template is newer. |
| `Rules.md` | The user | The Instructions workflow (permanent rules the user asked for). Read by every run; wins over `CLAUDE.md` except for its protected-path rules. |
| `About-Me.md` | The user, with the agent's help | The agent, whenever it learns something lasting about the user (Ingest step 8). |

The agent reads them in that order: `CLAUDE.md`, then `Rules.md`, then `About-Me.md`.

## What a tidy-up leaves in the folder

Filing first (rulebook version 22): each original moves into its PARA folder as it is, under a meaningful name (its own when it has one), with one line in the folder's hub note, one row in `index.md` and one `Filed:` line in `log.md`. A document of a listed kind gets a companion note next to it, any other document a text copy, and a web clip, a context note, an instruction note or a rule in `Rules.md` can ask for a note; photos are only filed. Every note Bower writes has `by: bower`, opens with Bower's note and keeps an append-only `## History`, whose filed, moved and status lines the runner writes. The agent also writes `.bower/checks.txt` (two notes that disagree) and `.bower/next.txt` (at most three steps for the owner), which the runner reads, reports and removes. `0-Inbox/Processed/` keeps only instruction notes, raw clips, unconvertible items and duplicates.

Two things in a folder are written by the runner, not by the agent: `.bower/last-run.json`, the outcome of the last tidy-up (`state`, counts, one sentence for people, the failure's `reason`), and the matching line at the end of `log.md` (#315). The runner's post-run audit counts `.bower/` among the places a run may write, so that file is saved like any other change.

Whether the agent may use the web is not in this template: a tidy-up gets the web tools only when the instance allows them (`BOWER_ALLOW_WEB`) and the user turned on **Let Bower look things up on the web** in Settings (#374).

## Changing the rulebook

Any change to `CLAUDE.md` that existing vaults should receive bumps `bower_rules_version` by one. The app compares the vault's number with the template's (compiled in at build time) and offers the update when the vault is behind. A vault whose `CLAUDE.md` has no `bower_rules_version` counts as version 1, the rulebook from before the split: the update also moves the user's own additions into `Rules.md`: the lines of its `## Rules` section, then, under `## Migrated from your old rulebook (v1)`, every section this template has no heading for and the lines a shared section (`## Tags`) has that this template lacks. The update recognises a line as Bower's own when this template has it or an earlier version did: whenever you remove or reword a line here, add the old line to `app/src/rulebook-retired.ts` in the same PR, or old folders would get it copied into their `Rules.md` as if the user had written it. Never reuse the `## Rules` section for anything the user writes.
