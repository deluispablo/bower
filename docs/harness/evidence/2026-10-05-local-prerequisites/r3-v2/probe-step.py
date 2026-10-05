import json, os, pathlib, re, time
from datetime import datetime, timezone
start = datetime.now(timezone.utc).isoformat()
started_ns = time.monotonic_ns()
inputs = json.loads(pathlib.Path(os.environ["GITHUB_EVENT_PATH"]).read_text()).get("inputs", {})
if os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
    raise ValueError("Only the explicit P2 probe workflow may start this job.")
for key in ("request_id", "attempt_id"):
    if not re.fullmatch(r"p2-[A-Za-z0-9_-]{1,48}", inputs.get(key, "")):
        raise ValueError("Use only a synthetic P2 identifier.")
if inputs.get("mode", "") not in ("normal", "fail-before-report"):
    raise ValueError("Unsupported probe mode.")
report = {"v": 1, "probe": "R3", "requestId": inputs["request_id"], "attemptId": inputs["attempt_id"],
          "workflowRunId": os.environ["GITHUB_RUN_ID"], "workflowRunAttempt": os.environ["GITHUB_RUN_ATTEMPT"],
          "workflowSha": os.environ["GITHUB_SHA"], "probeStepStartedAt": start,
          "reportPreparedAt": datetime.now(timezone.utc).isoformat(),
          "preReportElapsedNs": time.monotonic_ns() - started_ns,
          "mode": inputs["mode"], "outcome": "probe-report-created", "productEffects": []}
output = pathlib.Path(os.environ["RUNNER_TEMP"]) / "bower-p2-probe"
output.mkdir(mode=0o700, exist_ok=True)
if inputs["mode"] == "fail-before-report":
    raise RuntimeError("Intentional synthetic pre-report failure.")
(output / "report.json").write_text(json.dumps(report, sort_keys=True) + "\n")
print("P2 probe report created; no product operation was executed.")
