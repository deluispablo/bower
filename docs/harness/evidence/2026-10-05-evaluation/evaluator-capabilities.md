# Evaluator CUA capability inspection

Session: `p2-evaluate-capabilities-2026-10-05`, contracts-2 / P2. Coordinator registration reference `e57a1b4`; current source reference `390d305`. Read-only prerequisite inspection only; no app evaluation or browser grant.

## Actual calls and results

1. `await cua.getState()` completed in 0.1628 s:

```json
{"apps":[],"browsers":[],"errors":["Native apps: Error: The Mac is locked and automatic unlock could not unlock it. Ask the user to unlock the Mac manually before continuing."]}
```

2. `await cua.rewriteDocumentation()` completed in 0.0080 s and returned the general Computer Use API documentation. This is documentation only; it selected no surface.
3. `await cua.listBrowsers()` completed in 0.1169 s and returned `[]`. This browser-only inventory also found no IAB.

Root's previously reported browser id `2`, Codex In-app Browser, metadata `codexSessionId:01a10bbd-05a1-7c82-bf5a-bf5b979b2eba`, was **not present in this evaluator session's inventory**. That root observation is historical coordinator evidence, not this session's available browser identity. No browser ID can be truthfully selected from the results above. The native Mac lock error does not itself prove why the browser-only list is empty.

## Documented capability versus available capability

The general documentation exposes `cua.listBrowsers`, `getBrowser({id})` (select without opening a tab), `Browser.documentation()`, `listTabs`, `getTab`, and `createBrowserTab`. Selecting an actual browser normally returns its first-use documentation. Generic Target supports AX state, screenshot, click, drag, scroll, text selection/value and secondary AX actions; generic Tab adds native input and optional navigation/lifecycle. DOM-only tabs require provider-documented Playwright locators because native input throws.

The general documentation contains **no viewport, console-reading, file-upload or network-control API**. Those capabilities require an actual provider's documentation. With no listed browser, I did not guess id2 or select Chrome, bind a tab, call `getApp`, or invoke undocumented APIs. Therefore:

| Required capability | This session's observed status |
| --- | --- |
| IAB identity/binding | Unavailable: browser inventory empty |
| Viewport 390×844 and 1440×900 | NOT ESTABLISHED; no provider documentation |
| Console inspection | NOT ESTABLISHED; no provider documentation |
| File selection/upload | NOT ESTABLISHED; no provider documentation |
| Hover/focus/keyboard on IAB | NOT ESTABLISHED; generic native methods do not establish DOM provider support |
| Network offline/service-worker inspection | NOT ESTABLISHED; no general API documented |
| App flows/screens/evaluation | NOT RUN |

No tabs created or owned, no viewport changed, no settings changed, no navigation/input/app selection, no server/build/tests/provider/model calls, source/shared-record edits or delegation. No cleanup action is needed for this inspection.

Next prerequisite: coordinator establish why this evaluator's browser inventory differs from root's before assigning the future frozen build. If native app observation is needed, the tool explicitly requires the Mac to be unlocked manually; this inspection does not attempt unlocking. A fresh permitted browser inventory must expose an actual IAB identity, then its returned documentation can establish supported controls without changing settings. Root's existing successful about:blank check cannot certify controls in this evaluator session. No workaround automation stack or acceptance claim is proposed.
