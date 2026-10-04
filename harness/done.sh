#!/usr/bin/env bash
# Closes one entry of harness/features.json, only if it is really done:
# runs `pnpm check` and the entry's own `verify`; then flips `passes`,
# logs a line in progress.md and commits everything with the message given.
# usage: bash harness/done.sh <id> "<commit message>"
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; msg="$2"
verify=$(node -e 'const f=require("./harness/features.json").find(x=>x.id===process.argv[1]); if(!f){console.error("no entry "+process.argv[1]);process.exit(2)} process.stdout.write(f.verify)' "$id")
log=$(mktemp)
echo "check…"; pnpm check >"$log" 2>&1 || { tail -40 "$log"; echo "pnpm check failed: $id stays open"; exit 1; }
echo "verify: $verify"; bash -c "$verify" >"$log" 2>&1 || { tail -40 "$log"; echo "verify failed: $id stays open"; exit 1; }
node -e 'const fs=require("fs");const p="harness/features.json";const f=JSON.parse(fs.readFileSync(p));f.find(x=>x.id===process.argv[1]).passes=true;fs.writeFileSync(p,JSON.stringify(f,null,2)+"\n")' "$id"
echo "- $(date +%F): $id passes — ${msg}" >> harness/progress.md
git add -A && git commit -qm "$msg" && git log --oneline -1
node scripts/harness-status.mjs | head -1
