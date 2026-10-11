# "Next steps" in Bower's project notes: a plain list (TL-P4-47 addendum 3, owner OK 2026-10-11)

The owner chose (a). It is the least change to the note view's Markdown renderer (src/features/note/markdown.tsx), with no new component. Severity (NN/g): minor.

- **In a Bower region** (for example "Next steps"), a task line (`- [ ]` / `- [x]`) shows as a plain list item, with no Checkbox:
  - an open item: the list's normal bullet and its text;
  - a done item: the same, in today's `md-done` look (muted and struck through), with no box.
- **Outside Bower's regions,** the person's own tasks keep today's working Checkbox. Their tick positions count only the person's tasks, so a tick never lands on a Bower item.
- **No new copy and no hint text.** The section heading already says what it is, and Bower keeps it current.

| Situation | What shows |
| --- | --- |
| A Bower project note with Next steps | Bullets with no boxes; done items muted and struck. |
| The person's own task list in the same note | Working checkboxes, as today; ticking one changes only that task. |
| A note with no Bower region | As today. |

Accessibility: the plain items are list items, not disabled controls. Axe at WCAG 2.2 on a project note, on demo and fake, at 375 and 1440.
