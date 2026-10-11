# Your original rules beside the rules added in Bower (TL-P4-53, D1–D2)

The owner OKed this on 2026-10-10. The original rules prose is shown, never converted. It is the least change to today's "Your rules" section (BowerScreen.tsx) and the panel's rules summary (BowerPanel.tsx). There is no consent step and no conversion Undo; adding and removing a rule keep their existing undo. Severity (NN/g): major (it changes how the rules are listed).

## The rules screen ("Your rules", phone and desktop alike, one column)

- **Unchanged:** the heading "Your rules", today's intro line, the add form, pending rules and their notes, and the Remove buttons on managed rules.
- **When the rules note has original prose** (non-empty once Bower's region is set aside), the section shows, in this order:
  1. The label "Written in your rules note". It uses the same label style as the run result's lists (14 px, 600).
  2. The prose itself, read-only, rendered by the existing note viewer's Markdown renderer. It shows in full, with a 2 px `--line` left edge (radius 0). There is no Remove and no edit control.
  3. A foot row in today's `ruleFoot` layout. The muted text reads "Bower follows these too. To change them, edit the note.", next to a link "Open your rules note" that opens the note on its note page.
  4. The label "Added in Bower", then today's managed list. The label shows only when there is at least one managed rule. With none, nothing is shown in its place: the first rule added through the form appends Bower's region, and that add is the consent.
- **With no original prose:** exactly as today, with no labels.

## The panel's summary (BowerPanel.tsx, desktop right panel)

- **With original prose:** the heading reads "Rules", with no number, so it never claims "0 rules". The first item is a muted link "Your rules note" to the note, followed by up to 4 managed rules (5 items in all, as today).
- **Without:** today's `countOr(rules.length, 'rule', 'Rules')` and list.

## In the file

- Bower's region, appended at the end, has the heading "Rules added in Bower". The original text above it is never changed.

## What the person sees: rows to test

| Situation | What shows |
| --- | --- |
| Original prose, no rules added yet | "Written in your rules note", the prose, the foot line and link; no "Added in Bower"; the form as today. |
| Original prose and 2 added rules | The prose block, then "Added in Bower" with the 2 cards and their Remove buttons. |
| No original prose | "Your rules" exactly as today. |
| A pending rule with original prose | Under "Added in Bower", with today's pending look and note. |
| Panel with original prose | "Rules" (no number), "Your rules note" first, then up to 4 rules. |
| Panel without | "2 rules" etc., as today. |
| "Open your rules note" | The note page of the rules note. |
| The file after the first add | The original text untouched, then "Rules added in Bower" at the end. |

Accessibility: the prose is a region labelled by "Written in your rules note". The link has a visible name. Axe at WCAG 2.2 on the Bower screen and panel, on demo and fake, at 375 and 1440.
