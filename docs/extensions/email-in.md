# Extension: email-in

Status: **not built**. This is a design note for an optional module an operator could add on top of their own instance, kept out of the core product. See "No email-in" in `ARCHITECTURE.md`'s "Why not X" and the "Notifications by web push; no email" entry in `docs/decisions.md` for why it stays out of v5.

## What it would do

Give each user of an instance an email address (or, more precisely, an address the operator's Gmail already receives) that drops straight into their `0-Inbox/`:

1. The operator picks a Gmail label, or a Gmail alias, that a user's mail can be sent or forwarded to (for example a plus-address on the operator's own account, or a shared address the operator already receives). This is entirely between the operator and their Google account; the app and the Worker are not involved in choosing or managing it.
2. A Google Apps Script, running under the operator's Google account (the only account with the mail and the Drive folders), fires on a time-driven trigger — every 5 or 15 minutes, Apps Script's own minimum granularity.
3. On each tick, the script looks for new, unread mail matching the label or alias, and for each message:
   - Writes the body as a Markdown note into the sending user's `0-Inbox/`, with frontmatter recording who it came from and when (mirroring the `Bower - <date> <title>.md` instruction-note shape the app itself writes, so the agent treats it the same way).
   - Writes each attachment into `0-Inbox/` as its own file.
   - Marks the message processed (a label) so the same mail is never ingested twice.
4. If anything was written, the script needs to get a run started for that vault — see below.

## Triggering a run

The app triggers a run today with a signed-in `POST /process` (`api/src/process.ts`): a same-origin request carrying the user's `HttpOnly`, `SameSite=Lax` session cookie, checked against `APP_ORIGIN` by both CORS (`api/src/security.ts`'s `appCors`) and the CSRF `requireSameOrigin` check, then rate-limited and quota-checked before it calls `dispatchIngest`. An Apps Script has no browser, no cookie jar and no way to complete the Google OAuth sign-in flow that mints that session in the first place, so it cannot make this call at all — there is no version of it that "just adds a bearer token" and calls the normal endpoint.

Two ways remain to get from "new mail written to Drive" to "a run happens":

- **A new authenticated endpoint just for this.** The Worker could expose a route a script calls with some new credential (a per-user key, a shared secret) to dispatch a run directly, the way the runner calls `GET /runner/vaults/:id` with `BOWER_API_KEY` today. Rejected: it is a new credential type, held outside Cloudflare and GitHub's secret stores, that a script running under the *operator's* Google account would use to act on behalf of a specific *user's* vault — exactly the kind of standing, broad-reach credential `ARCHITECTURE.md`'s threat model tries to avoid handing to anything but the Worker. It would need its own rotation story, its own rate limiting, and a new way to fail loudly when misconfigured, all to save one Process press.
- **Write-only script; let the button pick it up (recommended).** The script only ever writes files to Drive. Nobody calls `/process` on the user's behalf; the user (or the operator, on their behalf) presses Process the normal way once they know something arrived, or — since `agent/workflows/lint.yml` already runs on a schedule — the next scheduled lint pass notices the new file sitting in `0-Inbox/` and processes it without anyone pressing anything. The delay is bounded by whatever cadence the lint workflow already runs on, not by a new poller.

Recommendation: the write-only approach. It needs no new credential, no new Worker route, and no change to the trust model in `ARCHITECTURE.md` — the script's blast radius, if compromised, is "can write files to Drive it can already write files to," not "can start runs for arbitrary vaults." The cost is latency: mail sits until the next lint run or a Process press, rather than triggering a run within seconds.

The write-only approach also avoids a related trap: a `repository_dispatch` call to the instance repo (the way `dispatchIngest` in `api/src/github.ts` does it) needs a `GITHUB_TOKEN` with `contents: write` on that repo. Today that token is a single Worker secret (`api/src/env.ts`), never leaves Cloudflare, and is used only server-to-server. Putting a copy of it into an Apps Script's project properties — so the script could dispatch runs itself — means a credential capable of pushing to the operator's private instance repo now lives inside a per-user script the operator may not audit as carefully as the Worker's own secrets, with no central place to rotate or revoke it. `ARCHITECTURE.md`'s least-privilege policy ("secrets only in Cloudflare/GitHub") rules this out; it is the same reason the Worker, not the browser or the runner, is the only thing that ever calls GitHub's dispatch API.

## Trade-offs

- **Privacy.** Mail content — including anything a sender writes in the body or attaches — lands in the user's Drive as plain files. Today nothing but Drive uploads and the app's own instruction notes ever reach the vault; email-in adds a channel the user does not directly control the source of. `docs/privacy.md` would need a line for any operator who turns this on.
- **Spam and misdirected mail.** Anything that reaches the label or alias gets ingested as if the user wrote it, unless the script checks the sender against an allowlist (the v4 prototype did this: only mail from the vault's own owner address was kept, everything else logged and skipped). Without that check, spam becomes notes in the user's PARA folders.
- **Attachment size.** Apps Script's `GmailApp` and `DriveApp` both cap what a single execution can move (Apps Script's per-execution quota, and Gmail's own attachment size limit); a large attachment can silently fail to save or blow the execution's time budget.
- **Apps Script quotas.** Time-driven triggers, `UrlFetchApp` calls and total daily runtime are all capped per Google account (higher on Workspace, lower on a plain consumer account); an operator running this for many users on one personal account could hit the daily trigger-runtime quota before hitting anything else.
- **Yet another account to maintain.** `docs/decisions.md`'s "Button-only trigger" entry already rejected Apps Script polling for exactly this reason once (the v4 prototype's 5-minute detector): it is an extra thing running under the operator's own Google identity, outside Cloudflare's and GitHub's free tiers, that only the operator can see fail.

## Outline (pseudocode, not runnable)

```
# Apps Script project, one per user, owned by the operator.
# Script properties: FOLDER_ID (this user's vault folder id).

function onTimeTrigger():
  lock = acquireScriptLock(timeout = 10s)
  if not lock: return  # previous tick still running

  try:
    inbox = DriveApp.getFolderById(FOLDER_ID).getSubfolder("0-Inbox")
    threads = Gmail.search("label:<the chosen label> is:unread")

    for thread in threads:
      for message in thread.messages:
        if not message.isUnread(): continue
        if not fromAllowedSender(message):   # allowlist check
          message.markRead()
          continue

        note = renderMarkdown(
          frontmatter = { tags: ["instruction"], from: message.sender, date: message.date },
          body = stripQuotedReply(message.plainBody),
        )
        inbox.createFile(name = "Bower - <date> <subject>.md", content = note)

        for attachment in message.attachments:
          inbox.createFile(attachment)

        message.markRead()

      thread.addLabel(processedLabel)

    # No dispatch call here. The next Process press, or the next
    # scheduled lint run, picks up what was just written.

  finally:
    lock.release()

function setup():
  # run once, by hand, from the Apps Script editor
  deleteAllTriggers()
  createTimeTrigger(everyMinutes = 15)
  ensureLabelExists(processedLabel)
```

## How an operator would document it for their users

If an operator sets this up, they tell their users, in their own instance's copy of the runbook or a short note in the app:

- The email address (or how to reach the label/alias) that drops mail into their notes.
- What happens to the body (becomes a note) and to attachments (saved as files).
- That it can take up to the next scheduled lint run, or until they press Process, before it shows up as organised notes — it is not instant.
- That the operator's Google account is the one receiving the mail, consistent with the household trust model already in `docs/privacy.md` (the operator can, in principle, read every vault of their instance).
- Whom to email, and that mail from anyone else is ignored (or, if there is no allowlist, that anyone with the address can write into their notes).

## Why it stays out of v5

Every point above — a second Google identity's worth of quotas and failure modes, a new privacy surface, and a trigger mechanism the "Button-only trigger" decision already rejected once for the app itself — is the same shape of cost `ARCHITECTURE.md`'s "No email-in" entry gives for leaving it out: another credential, another attack surface, another thing to maintain, for something a Drive upload or the app's Add and Tell Bower screens already do. See `docs/decisions.md`'s "Notifications by web push; no email" entry for the related call on the output side. It is documented here, instead of silently dropped, so an operator who wants it anyway has a starting design instead of a blank page.
