# Packet: c4-runner-region (stage 4, follow-up to c4-run-counts)

- **Entry:** `c4-runner-region` (perf, mechanical). Worktree `/private/tmp/bower-c4-region`, branch `c4-runner-region` from `claude/p3`.
- **Ruling sweep:**
  - TL-P4-22 addendum 4 (main fc4a6dec). The runner workflow's home is `runner/workflows/tidy.yml`, which `scripts/new-instance.sh:34,140` copies into the instance repository.
  - c4-run-counts: the timing line reads `BOWER_RUNNER_REGION`, and prints "unknown" when it is unset.
- **Starting model:** `bower-mechanical` (Haiku).

## Contract

1. **Add one step** to `runner/workflows/tidy.yml`, before the step that runs the runner. It writes `BOWER_RUNNER_REGION` to `$GITHUB_ENV`. The value comes from the Azure Instance Metadata Service endpoint `compute/location`, in text format, read with `curl -s -m 2 -H Metadata:true`.
   - Use the documented URL, with its `api-version` and `format=text`. Cite the Azure IMDS docs.
2. **The step never fails the job.** On any failure (timeout, empty answer, not Azure), the variable stays unset, so the line prints "unknown". Write an empty value only if the docs say an empty value means unset; otherwise skip the write.
3. **Nothing else changes:** no secret, no new permission, no change to the existing steps.

## Red

Add `the workflow records the runner region and never fails on it` to `runner/test/new-instance.test.ts`, or to a test beside it that reads `tidy.yml`. The test asserts three things:
- the step exists before the runner step;
- it uses `-m 2` and the `Metadata:true` header;
- it cannot fail the job (`continue-on-error: true`, or a guarded command).

Today the test fails, because the step does not exist.

## Verify

- `pnpm -C runner exec vitest run -t "the workflow records the runner region and never fails on it"`
- `pnpm check` is green.

## Commits

The red (tests only), then the fix, then a short notes file in its own commit (`docs/harness/2026-10-09-c4-runner-region-notes.md`), with `tests changed:` lines. The card carries a `worktree:` line. Never push or deploy. The lead ships the change with the next runner deploy.
