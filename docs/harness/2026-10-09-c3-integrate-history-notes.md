# c3-integrate-history notes
- Helper: `historyTips(cwd)` and `commitsSince(base, paths, cwd)` in scripts/harness-git.mjs (HEAD plus MERGE_HEAD; git-merge docs).
- Readers changed: src/docs.test.ts (compat list). Other `..HEAD` readers under src/*.test.ts and scripts/*.mjs: none (guard test scans for them).
- integrate.sh unchanged. Removed: 3 lines in docs.test.ts (execFileSync import, git log call, split).
