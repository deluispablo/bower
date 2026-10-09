# Current state of the app, 2026-10-09

Built from `main` at 38995d97 with the demo source. I walked 16 routes and scenarios at 320, 375, 768 and 1440 px, in dark and light, and checked each with axe (tags wcag2a, wcag2aa, wcag21aa and wcag22aa, plus target-size), keyboard focus, target sizes and measured contrast. I also walked three tasks step by step: add a pile, answer a question and tidy up. The design checker re-ran every finding below. Ratings use the NN/g scale. Screenshots are in `2026-10-09-current-state/`.

## What matches the design

The app matches the "Bower app" canvas closely. That canvas is made of screenshots of the demo as built on 2026-10-04: sign-in is identical, and Home, the tree, a note, a folder, Tell Bower, Settings and the tidy-up dialog all keep its layout, tokens and copy. These came after the canvas and follow the brand book:

- the "Since the last tidy-up" card;
- note links inside questions;
- the honest clock in the run sheet ("Less than a minute so far. Usually about 5 minutes.");
- the replay ground line.

Text contrast passes axe in both themes on every screen. No page scrolls sideways at 320 px. The focus ring (2 px `accent-line`) is visible wherever focus is not hidden.

## Errors

### E1. Messages cover the buttons you want next (3, major)

- **Observation.** After you answer a question on Home, a message appears. At 375 px it is 188 px wide and sits mid-screen, at x 94, y 583, right over the next question's "Keep both" and "Keep one". A tap there hits the message, not the button. At 1440 px it covers "Keep as a rule". It lasts 4 s, or 8 s with an action. Resting the pointer on it pauses the timer, so it can stay indefinitely. It happens after every answer. The width comes from `left: 50%` with a translate, which shrinks the box to half the viewport instead of the intended `min(520px, 92vw)`.
- **Impact.** Someone answering several questions in a row is blocked on each one.
- **Suggestion.** The message must not cover the place where the next action is likely to be. On the phone it should use the full width it was meant to have, and it should sit clear of the content being worked on.
- **Evidence.** `x-toast-375-dark.png`, `x-toast-1440-dark.png`.
- **Related (1).** The "15 things filed. Watch" chip, in the `back` scenario at 375, has the same width problem: 188 px, with the text wrapping. The page has no bottom padding under it, so even at full scroll it covers the last row of the result. See `back-375-dark.png`.

### E2. On the phone, keyboard focus goes behind the tab bar (3, major; WCAG 2.4.11)

- **Observation.** At 375×812, tabbing down Home brings focus to "Weeknight curry" in Recent, which lies entirely under the bottom tab bar (top 744, bar top 740). The same happens on a note, Settings, a pile and Tell Bower. At 768, which also uses the phone shell (iPad portrait), "Keep both" and "Keep one" are half under the bar. `scroll-padding` is `auto`. Desktop at 200% zoom also gets the phone shell.
- **Impact.** Someone using a keyboard on a tablet, or zoomed in on desktop, cannot see where they are.
- **Suggestion.** A focused element must always stay visible above the tab bar, on every phone-shell screen.
- **Evidence.** `x-focus-obscured-375-dark.png`.

### E3. Closing "Tidy up 15 things?" drops the keyboard at the top of the page (2, minor)

- **Observation.** You open the dialog from the "Tidy up 15 things" button and close it with Escape or "Not now". Focus then goes to `main`, not back to the button, which is still there. This happens at 375 and at 1440. The WAI-ARIA APG modal dialog pattern returns focus to the opener. `returnFocusTo` in `src/ui/focus.ts` already does that elsewhere.
- **Impact.** A keyboard user has to tab back through the page to get where they were.
- **Suggestion.** Return focus to the opener when it still exists, as the other dialogs do.
- **Evidence.** `x-tidy-confirm-1440-dark.png` shows the dialog. Focus was read from `document.activeElement` after closing.

### E4. The desktop tab close button is 22×22 (2, minor; WCAG 2.5.8)

- **Observation.** axe target-size flags only this control, on every desktop screen. The spacing exception does not apply: the tab button's centre is 11 px away.
- **Impact.** It is easy to miss on a trackpad. It is a real AA failure, though only 2 px short.
- **Suggestion.** A target of at least 24×24.
- **Evidence.** axe rule `target-size` on `._tabX_`, seen in `home-1440-dark.png`.

### E5. In the replay, Bower lands in the air and hides behind what it carries (2, minor; found after the owner reported it)

- **Observation.** In "What Bower did", measured per frame at 375 and 1440 px:
  - At every shelf, Bower's toes stop 30 px above the twig. They land on the empty dashed slot, because `pointOn` aims at the slot's top edge.
  - At the inbox heap, Bower lands 0 to over 60 px above the label it picks. The target is the bounding box of a tilted label, and that label is often buried under others.
  - The carried label covers Bower's head in 332 of 841 frames at 1440, and in 222 of 841 at 375.
  - The tidy-up scene itself is right: the toes are within 2 px of its ground line.
- **Impact.** Bower looks as if it floats or vanishes. That breaks the brand's rules that every landing squashes onto something and that Bower faces and holds what it moves.
- **Suggestion.**
  - A landing puts the toes (y 92 of the drawing) on the top edge of what Bower stands on: the twig beside the slot, or the top label of the heap, laid flat.
  - The thing carried is the drawing's own small paper. Its name appears on the shelf.
- **Evidence.** Frame logs and shots are in the session's scratch folder. Before images are on the design canvas.

## Improvements

- **I1. The same questions twice on desktop Home (1).** The right Bower panel repeats both questions shown in the main column. Its link "Answer on Home" points to the page you are already on. See `home-1440-dark.png`.
- **I2. Tablet width (1).** At 768 the phone layout stretches: the "Tidy up" button is 692 px wide, and paragraphs run 696 px. The canvas never covered tablet sizes. See `home-768-dark.png`.

## Questions for the owner

1. **Tablet.** Should 768–899 px keep the stretched phone layout, get a centred column of limited width, or something else? (I2)
2. **Desktop Home's right panel.** Should it repeat the questions, or show something else while you are on Home? (I1)
3. **Bower's head as the note icon.** In folder lists, every note Bower keeps shows Bower's head, so it appears three or four times in a list (`folder-375-dark.png`). Do you want that as the sign for "a note Bower keeps"?
4. **The 44 px rule.** On the phone, the question answers are 40 px tall. Switches are 50×30, and segments and the request/rule choice are 34 tall. These sizes match native iOS, and nothing fails WCAG. Should they be raised to the house 44 px?

5. **"Brought up to date" shows only a note's first change.** This item came from the lead.
   - **What happens.** When one tidy-up adds two Timeline lines to a note, the Home result keeps one row per note with only the first change. The lead saw it on staging (a0a0c1a7, Flat hunt). The second line shows only on the note screen.
   - **Where.** `runLinkRows` in `src/features/tidy/run-words.ts` keeps the first row per path (`once`); `RunLinks.tsx` renders it.
   - **Not a defect.** Bower's report keeps both lines, so this is a presentation choice.
   - **Options.** (a) Keep it as it is. (b) One row per note, with its changes joined in report order (my recommendation). (c) One row per change, with the note's name repeated.

## Nit

Each of these is rated 1:

- **Heading order.** The right Bower panel uses h3 directly under the page h1, on every desktop screen.
- **Landmarks.** Sign-in has one block outside the landmarks. The welcome screen has no `main`.
- **Placeholders.** They use the browser default `#757575`, at 3.78:1 on dark, not a token.
- **Mono names.** Pile names with no text show in mono on Home but plain in the tidy-up dialog.
- **Repeated status.** While a run goes on desktop, "Writing your notes" appears four times: the chip, the card, the right panel and the status bar.
- **Light-theme icons.** The type icons of piles use amber and teal as strokes, at 1.49:1 and 1.54:1. They are decorative (`aria-hidden`), but this breaks the token rule that teal and amber are fills (`src/features/piles/PileStack.tsx`).

## Top three

E1 (messages cover the next buttons), E2 (focus hidden behind the tab bar), E3 (focus lost after the tidy-up dialog).
