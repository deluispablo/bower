# c4-runner-region notes

- Entry: c4-runner-region (packet docs/harness/2026-10-09-c4-runner-region-packet.md).
- Red: 0528b6cd, the test `the workflow records the runner region and never fails on it` in runner/test/new-instance.test.ts failed on "the Record the runner region step exists".
- Fix: cca37279, one step `Record the runner region` in runner/workflows/tidy.yml before the runner steps. It reads the Azure IMDS compute/location endpoint (api-version 2021-02-01, format=text) with `curl -s -m 2 -H Metadata:true`, accepts only a lowercase alphanumeric answer, and writes BOWER_RUNNER_REGION to $GITHUB_ENV. `continue-on-error: true`.
- Source: https://learn.microsoft.com/en-us/azure/virtual-machines/instance-metadata-service
- tests changed: runner/test/new-instance.test.ts: added one test only, no existing test modified or removed.
