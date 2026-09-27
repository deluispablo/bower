/**
 * What the demo's Bower "answers" when a run meets an instruction note:
 * scripted replies for the three example chips on the Tell Bower screen
 * (`components/tell-composer.tsx`) and the question already waiting in the
 * demo inbox, one generic reply for anything else. Pure: `server.ts` writes
 * the result into the folder.
 */

import { INBOX_QUESTION } from './fixture.js';

export type Reply =
  /** A new note in `Answers/`, titled `title`. */
  | { kind: 'answer'; title: string; body: string }
  /** A rule added to `Rules.md`. */
  | { kind: 'rule'; heading: string; rule: string };

/** The instruction's own text: the note without its frontmatter. */
export function instructionText(note: string): string {
  return note.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
}

/** `Bower - 2026-09-27 0815 Title.md` → `Title`. */
export function instructionTitle(name: string): string {
  return name
    .replace(/^Bower - \d{4}-\d{2}-\d{2} \d{4} /, '')
    .replace(/\.md$/, '')
    .trim();
}

function has(text: string, words: string): boolean {
  return text.toLowerCase().includes(words);
}

/** The scripted reply to the instruction `name` whose text is `text`. */
export function replyTo(name: string, text: string, date: string): Reply {
  const title = instructionTitle(name) || 'Your message';

  if (has(text, 'from now on') && has(text, 'recipe')) {
    return {
      kind: 'rule',
      heading: `## Recipes (owner's request, ${date})`,
      rule: '- File recipes under `3-Resources/Cooking/` and tag them `recipe`.',
    };
  }

  if (has(text, 'summarise the pdf')) {
    return {
      kind: 'answer',
      title,
      body: `# ${text}

From [[Boiler service invoice.pdf]], filed under [[Home]]:

- Annual boiler service, done this month, paid in full.
- The engineer found nothing to fix; next service due next September.
- Keep the invoice for the home insurance renewal in November ([[Bills and renewals]]).`,
    };
  }

  if (has(text, 'trip planning')) {
    return {
      kind: 'answer',
      title,
      body: `# ${text}

Everything is under [[Lisbon Trip]]:

- [[Flights and stays]]: flight times and the flat in Alfama.
- [[Things to see in Lisbon]]: tram 28, the viewpoints, a day in Sintra.
- [[Packing list]], based on [[Packing light]].

Missing: nothing yet on travel insurance.`,
    };
  }

  if (name === INBOX_QUESTION.split('/').pop()) {
    return {
      kind: 'answer',
      title,
      body: `# ${text}

From [[Lisbon Trip]] and its notes:

- Book the day trip to Sintra; the palace sells out ([[Things to see in Lisbon]]).
- Check what the card's travel insurance covers, and print it ([[Packing list]]).
- Pack a light rain jacket.

Flights and the flat are sorted ([[Flights and stays]]).`,
    };
  }

  return {
    kind: 'answer',
    title,
    body: `# ${title}

> ${text.replace(/\n/g, '\n> ')}

This is the demo, so these notes are samples and Bower only has scripted answers. Try one of the example messages on the Tell Bower screen to see a full reply; your own Bower reads your notes and answers here.`,
  };
}
