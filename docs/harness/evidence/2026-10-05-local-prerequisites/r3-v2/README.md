# R3 additive executor observation proposal

Status: prepared locally only, no repository/workflow/run changes. Plan contracts-2; P2-R R3/C12/C14. Source app44ee162, coordinator freeze fe9a965. Owner authorized reuse of existing bower-home and Google Cloud project; no new spend is authorized. This proposal needs independent review and complete trigger inventory before remote publication, and runtime evidence before dependent acceptance.

## Existing resource and isolated change

Read-only GitHub connector verified authorized repository deluispablo/bower-home, private, main, admin/push/pull capabilities. Read snapshot909f381c1f29809a92321dba6aab89feec898ce9: .github/workflows/ingest.yml blob e60b7dba58e2f74692603b64f96788539313d09b starts only repository_dispatch type ingest, invokes actual agent/run.sh, and receives model credentials. Its behavior must never be used for a P2 no-model probe. README is older in places (claims manual trigger absent in inspected current workflow); use actual pinned workflow, not prose, to determine behavior. Local public bower source7a5b1d0 is a different checkout/snapshot and is not a substitute for remote trigger inventory; preserve its existing untracked work.

Proposed additive diff creates ONLY .github/workflows/bower-p2-probe.yml. No checkout or old runner, Drive endpoint, token, model, mail, deploy or arbitrary callback. Manual workflow_dispatch only; no ingest event. Job token contents:read only, two-minute timeout, strict synthetic p2- identifiers, two enum modes. Upload action pinned to exact SHA already present in inspected existing workflow. Artifact contains only synthetic IDs, workflow/run identifiers, timestamps and empty productEffects. No shell interpolation of input strings. The accompanying probe-step.py mirrors the inline step for local deterministic checks, not an additional repository file.

## Prerequisites and exact execution sequence

1. Read all current remote .github/workflows triggers and deployment behavior before publishing. Pin current main and retain old workflow hashes. Resolve any push/workflow_run trigger that would deploy or run real work. Do not run local deploy scripts or an ingest dispatch.
2. Independently review this one-file additive diff. Confirm the owner-authorized resource boundary, runner allowance and available no-charge quota/cost control. Stop if additional spending or permission expansion is required.
3. Publish only the reviewed additive file to the authorized existing repo using an isolated branch/PR or reviewed default-branch update. Both manual and repository dispatch require workflow presence on default branch; a branch-only file is not evidence the event can start it. Do not mutate bower-app remotes/push or replace existing workflows. PR attachment applies if a PR is created.
4. Record the actual workflow commit/ref and exact operator/API submission time/response before each run. Dispatch ONLY named bower-p2-probe.yml with e.g. request_id=p2-example, attempt_id=p2-attempt1, mode=normal. Current available GitHub connector exposes repository/file APIs and run/artifact reads, but no workflow dispatch tool was observed; gh is not on PATH. Use authorized normal UI or a separately configured bounded API client, never extract tokens from another app/session.
5. Run one normal observation then a same-request/new-attempt duplicate observation, one withheld-ack submission observation and fail-before-report. Maximum four two-minute jobs in first batch. Correlate exact run IDs, created/start/finish times, job steps and artifact; record timeout/permission/no-run cases honestly. API acknowledgment is not run completion, and duplicate runs are not an exactly-once effect guarantee.
6. No live callback collector is established. This first slice measures dispatch/startup/report visibility/failure only. Scratch admission/claim/revision/checkpoint doubles and later authenticated callback tests remain separately required by R3; local generated empty-effect reports do not prove durable app recovery, duplicate application prevention or a completed barrier.
7. Retain sanitized synthetic artifacts/evidence. If reverting, remove ONLY the new probe workflow through a reviewed inverse diff; preserve old main content/workflow hashes. Cancel only explicitly identified probe runs if needed, remove only their synthetic artifacts when authorized; never delete the repository, old deployments, production grants or personal data. Record residual artifacts/runs.

## Actual local checks

local-self-check.json: normal succeeds and creates an empty-product-effect report; invalid synthetic ID and old ingest event refuse without report; intentional pre-report failure creates no report. Four local cases passed. No GitHub YAML validation, Actions dispatch/runner, latency, callback, durable admission, billing or data-effect certification. R3 runtime NOT RUN.

## Primary references checked 2026-10-05

- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax

These support event/default-branch and least-permission setup; actual existing-resource observations are required to accept the premise.

## Timestamp correction (v2, current e37af01/source44ee162)

Independent review Minor corrected locally; original packet is preserved. probeStepStartedAt describes only the Python probe step, not platform job start. reportPreparedAt and preReportElapsedNs are captured before JSON serialization/write; they do not claim write completion, fsync durability, artifact visibility or full job duration. Obtain actual platform job start/finish and operator-observed artifact availability as separately correlated evidence after a real run. No runtime provider/platform result follows from these fields. Inline YAML step and local mirror remain identical. Existing four synthetic local controls are repeated on this exact replacement; no publishing/dispatch/spend occurs.
