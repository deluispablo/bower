#!/usr/bin/env bash
# Closes one entry of harness/features.json, only if it is really done:
#  1. no other entry's `passes` changed (one entry per commit);
#  2. red before green: with this change's code set aside (tests kept), the
#     entry's verify must FAIL; when the fix is committed already, --fixed-in
#     <sha> puts that commit's code back as it was and expects the same red;
#     --known-green "<why>" (only for an entry with a note) skips the red;
#  3. `pnpm check` passes, and the verify passes and runs at least one test;
#  4. then `passes` flips (only staged changes and harness/ are committed), a proof line is written (harness/proof.log, checked
#     by scripts/check-harness.mjs), progress.md gets a line, and it commits.
# usage: bash harness/done.sh <id> "<commit message>" [--fixed-in <sha> | --known-green "<why>"]
set -euo pipefail
cd "$(dirname "$0")/.."
# The rules as they are now, kept aside: the red step may set scripts/ aside too.
export HARNESS_RULES="$(mktemp -d)/harness-rules.mjs"
cp scripts/harness-rules.mjs "$HARNESS_RULES"
args=$(node --input-type=module -e '
  const { doneArgs } = await import(process.env.HARNESS_RULES);
  import { readFileSync } from "node:fs";
  const argv = process.argv.slice(1);
  const entry = JSON.parse(readFileSync("harness/features.json", "utf8")).find((x) => x.id === argv[0]);
  const { execSync } = await import("node:child_process");
  let committed;
  try { committed = JSON.parse(execSync("git show HEAD:harness/features.json", { encoding: "utf8" })).find((x) => x.id === argv[0]); } catch { committed = undefined; }
  try { const a = doneArgs(argv, entry, committed); console.log(JSON.stringify(a)); } catch (e) { console.error(e.message); process.exit(2); }' "$@") || exit 2
get() { node -e 'process.stdout.write(String(JSON.parse(process.argv[1])[process.argv[2]] ?? ""))' "$args" "$1"; }
id=$(get id); msg=$(get msg); mode=$(get mode); sha=$(get sha); reason=$(get reason)

verify=$(node -e 'const f=require("./harness/features.json").find(x=>x.id===process.argv[1]); if(!f){console.error("no entry "+process.argv[1]);process.exit(2)} process.stdout.write(f.verify)' "$id")
log=$(mktemp)

# 1. One entry per commit: only what is staged goes in, and no other entry flips.
unstaged=$(node --input-type=module -e '
  const { notStaged } = await import(process.env.HARNESS_RULES);
  import { execSync } from "node:child_process";
  console.log(notStaged(execSync("git status --porcelain --untracked-files=all", { encoding: "utf8" })).join(" "));')
[ -n "$unstaged" ] && { echo "Not staged: $unstaged. Stage this entry's change (git add), set the rest aside."; exit 1; }
others=$(node --input-type=module -e '
  const { othersFlipped } = await import(process.env.HARNESS_RULES);
  import { readFileSync } from "node:fs";
  import { execSync } from "node:child_process";
  const now = JSON.parse(readFileSync("harness/features.json", "utf8"));
  let before = []; try { before = JSON.parse(execSync("git show HEAD:harness/features.json", { encoding: "utf8" })); } catch {}
  console.log(othersFlipped(before, now, process.argv[1]).join(" "));' "$id")
[ -n "$others" ] && { echo "Other entries changed passes in this change: $others. One entry per commit."; exit 1; }

# 2. Red before green.
excl='\.test\.tsx?$|^e2e/|^src/data/contract/|^src/testing/'
paths="src public index.html vite.config.ts scripts package.json AGENTS.md docs"
# Changed or new code (tests and the harness's own records stay): the change being proved.
code=$(git status --porcelain --untracked-files=all -- $paths | sed 's/^...//' | grep -vE "$excl" || true)
expect_red() {
  if bash -c "$verify" >"$log" 2>&1; then
    echo "The verify passes without the change: it does not pin it. Fix the test."; exit 1
  fi
  kind=$(node --input-type=module -e 'const { redKind } = await import(process.env.HARNESS_RULES); import { readFileSync } from "node:fs"; console.log(redKind(readFileSync(process.argv[1], "utf8")));' "$log")
  if [ "$kind" != "assert" ]; then
    tail -15 "$log"; echo "Without the change no assertion failed ($kind): a test that cannot load, or none that ran, is not a red that pins the behaviour."; exit 1
  fi
}
case "$mode" in
  red)
    how="red"
    [ -z "$code" ] && { echo "No code change to set aside: the fix is committed already. Pass --fixed-in <sha>, or --known-green \"<why>\" for an entry with a note."; exit 1; }
    echo "red: setting aside $(echo "$code" | wc -l | tr -d ' ') changed file(s) and running the verify…"
    # Everything is staged, so the index keeps the change while the working tree goes back to HEAD.
    trap 'git checkout --quiet -- $code' EXIT
    for f in $code; do
      if git cat-file -e "HEAD:$f" 2>/dev/null; then git show "HEAD:$f" > "$f"; else rm -f "$f"; fi
    done
    expect_red
    git checkout --quiet -- $code; trap - EXIT
    ;;
  fixed-in)
    how="red (fixed in $sha)"
    [ -n "$code" ] && { echo "Uncommitted code: commit it, or close without --fixed-in."; exit 1; }
    fix=$(git diff --name-only "$sha^" "$sha" -- $paths | grep -vE "$excl" || true)
    [ -z "$fix" ] && { echo "$sha changes no code."; exit 1; }
    echo "red: putting back $(echo "$fix" | wc -l | tr -d ' ') file(s) as they were before $sha and running the verify…"
    trap 'git checkout --quiet HEAD -- $fix 2>/dev/null; git clean -fq -- $fix' EXIT
    for f in $fix; do
      if git cat-file -e "$sha^:$f" 2>/dev/null; then git show "$sha^:$f" > "$f"; else rm -f "$f"; fi
    done
    expect_red
    git checkout --quiet HEAD -- $fix 2>/dev/null || true; trap - EXIT
    [ -n "$(git status --porcelain -- $fix)" ] && { echo "Could not restore the fix's files."; exit 1; }
    ;;
  known-green)
    how="known-green: $reason"
    [ -n "$code" ] && { echo "Uncommitted code: a known-green close changes no code."; exit 1; }
    ;;
esac

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
git add harness/ && git commit -qm "$msg" && git log --oneline -1
node scripts/harness-status.mjs | head -1
