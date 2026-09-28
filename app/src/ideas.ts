/**
 * The Ideas screen's data (#332, spec C.7; board `Phone-Ideas`): grouped
 * example sentences, verbatim from the board. Plain data, no DOM, so it is
 * unit-tested directly (`test/ideas.test.ts`); `routes/ideas.tsx` renders
 * it.
 *
 * Each idea shows its full sentence (the context and, where the board
 * gives one, the quoted ask or rule) and copies only the quoted part —
 * `prompt` — into the Bower tab's box. Where the board's sentence is
 * itself the quote (no lead-in), `text` and `prompt` are the same
 * sentence without its quote marks.
 *
 * The board groups these as Home and money, Health, Trips and projects,
 * Reading, Rules that save time — not the issue text's Home and money,
 * Work, Health, Learning, Travel; the board wins.
 */

export interface Idea {
  /** The full sentence shown on the row. */
  text: string;
  /** What Copy puts in the Bower tab's box. */
  prompt: string;
}

export interface IdeaGroup {
  title: string;
  ideas: readonly Idea[];
}

export const IDEAS: readonly IdeaGroup[] = [
  {
    title: 'Home and money',
    ideas: [
      {
        text: 'Add your last five receipts, then ask: "How much did I spend on groceries this month?"',
        prompt: 'How much did I spend on groceries this month?',
      },
      {
        text: 'Photograph every warranty. Ask: "When does the washing machine warranty end?"',
        prompt: 'When does the washing machine warranty end?',
      },
    ],
  },
  {
    title: 'Health',
    ideas: [
      {
        text: 'Add each lab report as it comes. Ask: "Show my results over time in a table."',
        prompt: 'Show my results over time in a table.',
      },
      {
        text: 'Before the appointment on the 14th, list what to ask the doctor.',
        prompt:
          'Before the appointment on the 14th, list what to ask the doctor.',
      },
    ],
  },
  {
    title: 'Trips and projects',
    ideas: [
      {
        text: 'Save bookings and articles. Ask: "Make an itinerary with a budget."',
        prompt: 'Make an itinerary with a budget.',
      },
      {
        text: 'Flat hunting: save listings, then "Compare the flats I saved and tell me which to visit first."',
        prompt: 'Compare the flats I saved and tell me which to visit first.',
      },
    ],
  },
  {
    title: 'Reading',
    ideas: [
      {
        text: 'Save articles you mean to read. Ask: "What do the sourdough articles disagree on?"',
        prompt: 'What do the sourdough articles disagree on?',
      },
    ],
  },
  {
    title: 'Rules that save time',
    ideas: [
      {
        text: 'From now on, file every receipt under Finance.',
        prompt: 'From now on, file every receipt under Finance.',
      },
      {
        text: 'Every job offer: pull out salary, location and deadline, and add it to a table.',
        prompt:
          'Every job offer: pull out salary, location and deadline, and add it to a table.',
      },
    ],
  },
];

/** The href that fills the Bower tab's box with `prompt` and navigates
 * there (the same `?text=` link Health's "Ask Bower to fix these" uses). */
export function ideaHref(prompt: string): string {
  return `/bower?text=${encodeURIComponent(prompt)}`;
}
