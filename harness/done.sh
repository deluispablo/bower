#!/usr/bin/env bash
# Closes one entry of harness/features.json, only if it is really done:
#  1. no other entry's `passes` changed (one entry per commit);
#  2. red before green: with this change's code set aside (tests kept), the
#     entry's verify must FAIL; when the fix is already committed, or the test
#     was green before on purpose, say why with --green-before "<reason>";
#  3. `pnpm check` passes, and the verify passes and runs at least one test;
#  4. then `passes` flips, a proof line is written (harness/proof.log, checked
#     by scripts/check-harness.mjs), progress.md gets a line, and it commits.
# usage: bash harness/done.sh <id> "<commit message>" [--green-before "<reason>"]
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; msg="$2"; green_before="${4:-}"
[ "${3:-}" = "--green-before" ] && [ -z "$green_before" ] && { echo "--green-before needs a reason"; exit 2; }

verify=$(node -e 'const f=require("./harness/features.json").find(x=>x.id===process.argv[1]); if(!f){console.error("no entry "+process.argv[1]);process.exit(2)} process.stdout.write(f.verify)' "$id")
log=$(mktemp)

# 1. One entry per commit.
others=$(node --input-type=module -e '
  import { othersFlipped } from "./scripts/harness-rules.mjs";
  import { readFileSync } from "node:fs";
  import { execSync } from "node:child_process";
  const now = JSON.parse(readFileSync("harness/features.json", "utf8"));
  let before = []; try { before = JSON.parse(execSync("git show HEAD:harness/features.json", { encoding: "utf8" })); } catch {}
  console.log(othersFlipped(before, now, process.argv[1]).join(" "));' "$id")
[ -n "$others" ] && { echo "Other entries changed passes in this change: $others. One entry per commit."; exit 1; }

# 2. Red before green.
how="red"
if [ -n "$green_before" ]; then
  how="green-before: $green_before"
else
  # Changed or new code (tests and the harness's own records stay): the change being proved.
  code=$(git status --porcelain --untracked-files=all -- src public index.html vite.config.ts scripts package.json | sed 's/^...//' | grep -vE '\.test\.tsx?$|^e2e/|^src/data/contract/|^src/testing/' || true)
  if [ -z "$code" ]; then
    echo "No code change to set aside: the fix is committed already. Pass --green-before \"<why>\"."; exit 1
  fi
  echo "red: setting aside $(echo "$code" | wc -l | tr -d ' ') changed file(s) and running the verify…"
  git stash push --quiet --include-untracked -- $code
  trap 'git stash pop --quiet' EXIT
  if bash -c "$verify" >"$log" 2>&1; then
    echo "The verify passes without the change: it does not pin it. Fix the test, or pass --green-before \"<why>\"."; exit 1
  fi
  if ! grep -qE "[1-9][0-9]* failed" "$log"; then
    tail -15 "$log"; echo "Without the change the verify failed, but no test failed (did it run any?): that is not a red test."; exit 1
  fi
  git stash pop --quiet; trap - EXIT
fi

# 3. Gates.
echo "check…"; pnpm check >"$log" 2>&1 || { tail -40 "$log"; echo "pnpm check failed: $id stays open"; exit 1; }
echo "verify: $verify"; bash -c "$verify" >"$log" 2>&1 || { tail -40 "$log"; echo "verify failed: $id stays open"; exit 1; }
if grep -qE "No test files? found|No tests found|Tests +0 passed|^ +0 passed" "$log" || ! grep -qE "[1-9][0-9]* passed" "$log"; then
  tail -20 "$log"; echo "verify ran no test: $id stays open"; exit 1
fi

# 4. Close.
node -e 'const fs=require("fs");const p="harness/features.json";const f=JSON.parse(fs.readFileSync(p));f.find(x=>x.id===process.argv[1]).passes=true;fs.writeFileSync(p,JSON.stringify(f,null,2)+"\n")' "$id"
hash=$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex").slice(0,16))' "$verify")
printf '%s\t%s\t%s\t%s\n' "$id" "$hash" "$(date +%F)" "$how" >> harness/proof.log
echo "- $(date +%F): $id passes — ${msg}" >> harness/progress.md
git add -A && git commit -qm "$msg" && git log --oneline -1
node scripts/harness-status.mjs | head -1
