// PreCompact hook: reminds the session that state lives in files (TL-P2-43). It never blocks:
// exit 2 would block compaction (https://code.claude.com/docs/en/hooks), so every path exits 0.
process.stderr.write('Compaction ahead: write your state to the harness files first (TL-P2-43).\n');
process.exit(0);
