# Uploads that did not finish arriving (C02 U1–U3, TL-P4-53)

The owner OKed this on 2026-10-10. It is the least change: one line on Home's Inbox card and one sheet before signing out, built from today's Inbox card, Sheet and Button. There are no repair screens. Severity (NN/g): minor (the line), major (the sign-out sheet, since it prevents silent loss).

## U1–U2. The Inbox line (Home.tsx, `Inbox`)

- **Where:** a second line under today's `inboxSub` ("3 things waiting. …"), as a `<p>` at 15 px. It shows only once the count read has finished, never while "Looking…".
- **Words, from the count and its completeness** (one general unanchored-declaration count, TL-P4-53 Q3/Q7). The color is `--accent-line`, except where noted:

| Count | Line |
| --- | --- |
| 0, complete | No line. |
| 1, complete | "1 pile didn't finish arriving. Add it again if you still need it." |
| N, complete | "N piles didn't finish arriving. Add them again if you still need them." |
| N ≥ 1, incomplete | "At least 1 pile didn't finish arriving. …" / "At least N piles …", with the same second sentence. |
| 0 known, incomplete or unknown | "Bower couldn't check that everything you added arrived." in `--text-muted`. Never "0". |

- **Informational only (U2):** no link and no button. "Add" is today's Add button on the same card, so the line never promises a repair Bower can't do. It is static text, not a live region or alert. It shows during a tidy-up too.
- **No jargon:** never "orphan", "upload", "session" or a file name.

## U3. After a reload, and signing out

- **Reload:** files kept on the device show today's sending or waiting state on their pile, never a file picker. Today's storage-fallback wording stays as it is. I verify this when it's built.
- **Signing out with something still sending from this device:** Settings → Sign out opens a sheet first (today's Sheet, laid out like "Delete your Bower account?").
  - Title: "Sign out now?"
  - Body (muted): "1 thing you added is still sending from this device. If you sign out now, it stops and you'll need to add it again." / "N things you added are still sending from this device. If you sign out now, they stop and you'll need to add them again."
  - Buttons: "Keep sending" (ghost, which closes the sheet and gets the focus first) and "Sign out" (danger, today's sign-out with its purge).
- **Nothing sending:** Sign out works exactly as today, with no sheet. A failed purge keeps today's "Signing out did not finish. Try again."

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| No pile left unfinished | The Inbox card exactly as today. |
| 1 / 3 unfinished, full read | The singular / plural line in accent-line, under the waiting line. |
| A read that failed in part | "At least …" with the count Bower knows. |
| Nothing could be checked | "Bower couldn't check that everything you added arrived." (muted); never 0. |
| Reload while files are sending | The pile shows sending or waiting; no picker opens. |
| Sign out while 2 things send | The "Sign out now?" sheet; Keep sending keeps them, Sign out stops them. |
| Sign out with nothing sending | No sheet, as today. |

Accessibility: the sheet is today's Sheet (focus trap, Escape is Keep sending, focus returns to Sign out). Axe at WCAG 2.2 on Home and Settings, on demo and fake, at 375 and 1440.
