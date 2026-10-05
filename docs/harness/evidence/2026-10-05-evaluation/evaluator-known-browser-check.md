# Known IAB identity resolution check

Read-only capability prerequisite only, contracts-2/P2. Coordinator references: clean root `667a80b`, source `cb73061`. Root's observed browser was IAB id `2` with metadata `codexSessionId:01a10bbd-05a1-7c82-bf5a-bf5b979b2eba`. This check did not evaluate that source.

The prior general CUA documentation explicitly documents `cua.getBrowser({id})`, selecting a browser without opening a tab and returning first-use provider documentation. Exactly one authorized selection attempt was made:

```javascript
let knownIab = await cua.getBrowser({ id: '2' });
```

Actual tool result, in 0.1358 s:

```text
Browser is not available: 2
```

No browser binding/backend/provider documentation was returned. Root's known identity cannot currently be resolved in this evaluator's CUA session despite root's available surface. Previous `getState` Mac-lock error and separate `listBrowsers() -> []` remain distinct observations; no causal explanation is inferred.

Viewport, console, file-upload, focus/keyboard and other IAB controls remain NOT ESTABLISHED in this evaluator session. All app evaluation remains NOT RUN. No retries, alternate API, native app selection, tabs, navigation, viewport/settings changes, inputs, server/tests/provider/model calls, source/shared edits or delegation occurred. No tab ownership or cleanup action resulted.

Existing capability report: [browser inventory evidence](/private/tmp/bower-p2-evaluator-capabilities.md). Stop condition reached: known browser unavailable. Further resolution needs a separate coordinator capability assignment; this result is not an evaluation grant or certification.
