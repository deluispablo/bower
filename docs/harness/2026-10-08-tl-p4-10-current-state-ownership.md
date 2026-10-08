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
