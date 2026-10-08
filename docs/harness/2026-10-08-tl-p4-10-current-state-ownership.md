# Technical-lead decision TL-P4-10: who owns an unmarked Current state

**Coordinator question, 2026-10-08, from the review that blocked `state-rewrite-change`.** A *Current state* without the `bower_state` mark was treated as Bower's, so a person's edit to an existing note would be rewritten silently. The coordinator's options: (a) unmarked counts as the person's, (b) compare with Bower's last write, (c) mark existing notes once in a migration.

**Ruling: (a) by default, plus an adoption that costs no extra read and one question per folder instead of one per note.**
1. **Marked section.** When the `bower_state` hash matches the section text, Bower rewrites the section. When it does not match, the person edited it: Bower adds a Timeline line plus a question, as already ruled.
2. **Unmarked section in a file untouched since Bower's last write: Bower adopts it.**
   - From now on, every Bower write to a note also sets `appProperties.bowerMd5`, the MD5 of the content it uploads, computed before the upload in the same request.
   - The listing already returns `md5Checksum` ([Drive API, files](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)). When `md5Checksum` equals `bowerMd5`, nobody has changed the file since Bower wrote it, so Bower may rewrite the section and set the mark.
   - Files written by older runs have no `bowerMd5` and fall under point 3.
   - Not (c): a one-off migration cannot know whether a note already holds a person's edits.
   - Not (b) through revisions: Bower writes with the person's own credentials, so revisions cannot tell the two writers apart.
3. **Otherwise, unmarked counts as the person's.** The news goes to the Timeline line only, with no rewrite and no question per note.
   - At most once per folder, the report asks one question: "Bower found summaries it did not write. May it keep them up to date?" A yes becomes a rule line (C11, `ask-answer-loop` and rule wording), and Bower then adopts those sections.
   - This matters at the cutover: the owner's real folder holds many notes written by the original app, and one question per note would bury the person.
4. **The minors, in the same round:**
   - **Undo of an empty Current state** restores it empty.
   - **A missing section is never dropped silently.** In a note Bower made (`by: bower`), Bower adds the section, with its mark. Otherwise the news becomes a Timeline line.
   - **The fallback line** follows the same limits as an authored line.

**Tests:**
- a person's edit to a marked section gets a line and a question, never a rewrite;
- an unmarked section in a file whose `md5Checksum` equals `bowerMd5` is adopted;
- an unmarked section with no `bowerMd5` gets a line and at most one question per folder;
- a "yes" rule lets Bower adopt the section (scripted, until C11 wires the answer);
- undo restores an empty section empty.

**Addendum, 2026-10-08: adoption by `bowerMd5` is withdrawn (live finding on `2b08fc1`).** The run after the coordinator's hand edit kept the edit and added a Timeline line, as ruled. But that append set `bowerMd5`, so the file now matches it while its section is still unmarked, and the next run would adopt the section and rewrite the person's text (`scripted.ts:694`). The flaw is in point 2 of this ruling:
- every note Bower writes from now on either has the mark (born Bower's) or has a section the person owns;
- the notes point 2 was meant for, written by earlier Bower runs, have no `bowerMd5` at all.

So adoption by checksum protects nothing and opens this hole.
- **`state-no-adoption`** (`bower-implementer`): remove adoption by `md5Checksum`/`bowerMd5`.
  - An unmarked *Current state* is the person's unless a rule line grants it (point 3, the one question per folder).
  - A Bower write never makes a section Bower's.
  - Keep `bowerMd5` only if something else uses it; otherwise remove it from writes, reads and the listing fields.
  - Test: after Bower appends to a note with an unmarked section, the next run still only adds a line.
- **In the same entry, the fallback line is reworded.** "Bower's current state would now read: X.; Y.; …" becomes one plain sentence, under the authored-line limits.

**Addendum 2, 2026-10-08: c05-hub-lines ×3 on `924e6d6` holds the ownership rule.**
- **Run 1** rewrote the marked state.
- **Run 2** kept the person's edit and asked once.
- **Run 3** kept the edit again, with no adoption and no new question.

Three findings become entries in the C05 slice:
1. **`fallback-no-duplicate`** (`bower-implementer`). When the same run already adds a line to that note citing the same thing, the fallback line is not written. Test: Job hunt gets one offer line, not two.
2. **`duplicate-by-hash`** (`bower-implementer`). This follows the local method: a duplicate found by hash is binned and reported. A thing whose content hash equals a file already filed is moved to the Drive Bin, never hard-deleted, and reported as "already saved as <name>". It adds no line and no note. Run 3's extra "confirms" line was this case.
3. **`home-inbox-first`** (`bower-implementer`). On that folder the Inbox appeared only after about 45 s, behind the last run's report. The Inbox renders from the listing first, and the report and questions fill in after. Target: the Inbox within 3 s on the live folder, measured in the e2e on the fake with a slow report read. Home's Drive calls fell from 221 to about 108.
