# The harness

How phase 2 (and later phases) is built: one feature at a time, each proven by a command, with a record that outlives any one working session.

- Read `progress.md` and `features.json` first.
- Pick the first feature with `"passes": false`.
- Do not edit the `verify` field of any feature.
- Flip `passes` to `true` only after running its `verify` and seeing it green.
- Append one dated line to `progress.md` for every session or feature.
- Commit after each feature; never mark two features in one commit.
- `bash harness/init.sh` installs, runs every gate and prints where things stand.

The vault contract (`src/data/contract/vault-contract.ts`) is the spine: every source behind `VaultSource` (the demo, Drive) must pass the same suite.
