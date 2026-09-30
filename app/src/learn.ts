/**
 * Learn Bower's copy (R-LEARN-2, spec 6.19): the four "How it works" cards,
 * the six examples and the example page's fixed wording. Plain data, no DOM,
 * so it is unit-tested directly (`test/learn.test.ts`); `routes/learn.tsx`
 * renders it.
 *
 * Every line of an example is tied to the feature that makes it true
 * (`FEATURES`), the way the intro's claims are (R-INTRO-6). A claim with no
 * shipped feature behind it does not get written.
 */

import type { ParaKind } from './components/folder-mark.js';

export const LEARN_PATH = '/learn';

export const LEARN_TITLE = 'Learn Bower';
export const LEARN_LEAD =
  'What Bower does, and what people use it for. Open this any time from Settings or the sign-in page.';
export const LEARN_INTRO_CARD = {
  title: 'The intro',
  hint: 'Five screens, two minutes',
} as const;
export const LEARN_HOW_TITLE = 'How it works';
export const LEARN_EXAMPLES_TITLE = 'Examples';
export const LEARN_IDEAS = {
  title: 'Ideas to try',
  hint: 'Things you can ask Bower, ready to copy',
} as const;
export const LEARN_EXAMPLE_HINT =
  'Examples show what Bower can do; your own Bower learns your way from what you add and ask.';

export interface HowCard {
  title: string;
  body: string;
}

export const HOW_IT_WORKS: readonly HowCard[] = [
  {
    title: 'Add a pile',
    body: 'Files, photos and links, with one line saying what they are.',
  },
  {
    title: 'Tidy up',
    body: 'One tap when you have added everything. The bar shows the progress.',
  },
  {
    title: "Read Bower's note",
    body: 'On every file: summary, key facts, what to check.',
  },
  {
    title: 'Ask',
    body: 'Questions, jobs and rules, in your own words.',
  },
];

/**
 * The shipped features an example may lean on, each with the spec ids that
 * make it true. The PR checklist walks this table.
 */
export const FEATURES = {
  pile: { spec: 'R-PILE', what: 'A pile of files and links with one line' },
  tidy: { spec: 'R-RUN', what: 'A tidy-up files each thing in a folder' },
  note: { spec: 'R-AG-2', what: "Bower's note on every file" },
  facts: { spec: 'R-KF', what: 'Key facts and what to check, with origins' },
  join: { spec: 'R-AG-11', what: 'New things checked against what you keep' },
  request: { spec: 'R-REQ', what: 'A request waits and is done at the tidy-up' },
  rule: { spec: 'R-REQ', what: 'A rule ("from now on") kept in Your rules' },
} as const;

export type FeatureId = keyof typeof FEATURES;

export interface Claim {
  text: string;
  feature: FeatureId;
}

export type ActId = 'add' | 'files' | 'ask' | 'get';

/** The four acts' headings, in order (Example-FlatHunt-375). */
export const ACTS: readonly { id: ActId; title: string }[] = [
  { id: 'add', title: 'You add' },
  { id: 'files', title: 'Bower files and writes' },
  { id: 'ask', title: 'You ask' },
  { id: 'get', title: 'You get' },
];

export interface Example {
  slug: string;
  title: string;
  /** One line under the title on Learn and on the example page. */
  blurb: string;
  /** The PARA folder the case mostly lives in (the mark on its row). */
  kind: ParaKind;
  acts: Readonly<Record<ActId, readonly Claim[]>>;
}

export const EXAMPLES: readonly Example[] = [
  {
    slug: 'flat-hunting',
    title: 'Flat hunting',
    blurb: 'Listings, a lease and a budget in one place.',
    kind: 'projects',
    acts: {
      add: [
        {
          text: 'Three listings, a lease draft and a link to a neighbourhood guide.',
          feature: 'pile',
        },
        {
          text: 'One line: "My move: the new job and a flat near it".',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'Each listing and the lease go in the right folder of your Drive.',
          feature: 'tidy',
        },
        {
          text: 'Each gets a note with the rent, the deposit and the dates.',
          feature: 'facts',
        },
        {
          text: 'The lease note says what to check before you sign.',
          feature: 'note',
        },
      ],
      ask: [
        {
          text: '"Which listing is cheapest per month once bills are counted?"',
          feature: 'request',
        },
      ],
      get: [
        {
          text: 'An answer at the next tidy-up, saved as a note that says which files it read.',
          feature: 'request',
        },
      ],
    },
  },
  {
    slug: 'job-search',
    title: 'A job search',
    blurb: 'Applications, offers and what you told each company.',
    kind: 'projects',
    acts: {
      add: [
        {
          text: 'Your CV, two job descriptions and an offer letter.',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'Each one is filed with the others from the same search.',
          feature: 'tidy',
        },
        {
          text: 'The offer letter gets a note with the pay, the start date and the notice period.',
          feature: 'facts',
        },
        {
          text: 'Bower checks a new offer against the earlier ones you keep.',
          feature: 'join',
        },
      ],
      ask: [
        {
          text: '"From now on, add every application to a list with its date and status."',
          feature: 'rule',
        },
      ],
      get: [
        {
          text: 'A list that grows with each application you add.',
          feature: 'rule',
        },
        {
          text: 'A heads-up when two notes disagree, such as two different start dates.',
          feature: 'join',
        },
      ],
    },
  },
  {
    slug: 'health-papers',
    title: 'Health papers',
    blurb: 'Letters and reports, kept and summarised.',
    kind: 'areas',
    acts: {
      add: [
        {
          text: 'A clinic letter and a lab report, photographed or as files.',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'Each goes in the right folder, with your original untouched.',
          feature: 'tidy',
        },
        {
          text: 'Each gets a short summary and the facts it states, dates included.',
          feature: 'facts',
        },
      ],
      ask: [
        {
          text: '"List the dates of my appointments this year."',
          feature: 'request',
        },
      ],
      get: [
        {
          text: 'A list built from your own papers. Bower summarises what is written; it does not give medical advice.',
          feature: 'note',
        },
      ],
    },
  },
  {
    slug: 'money',
    title: 'Money',
    blurb: 'Bills, receipts and subscriptions you can look up.',
    kind: 'areas',
    acts: {
      add: [
        {
          text: 'A few receipts and the latest bank statement.',
          feature: 'pile',
        },
        {
          text: 'One line: "March household paperwork".',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'Receipts and statements go in the right folder.',
          feature: 'tidy',
        },
        {
          text: 'Each note lists the amounts and dates it found.',
          feature: 'facts',
        },
      ],
      ask: [
        {
          text: '"How much did I spend on groceries this month?"',
          feature: 'request',
        },
      ],
      get: [
        {
          text: 'A note with the total and the receipts it came from.',
          feature: 'request',
        },
      ],
    },
  },
  {
    slug: 'things-you-read',
    title: 'Things you read',
    blurb: 'Articles and papers, with the parts worth keeping.',
    kind: 'resources',
    acts: {
      add: [
        {
          text: 'Links to two articles and a PDF of a paper.',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'They are filed next to what you already keep on the topic.',
          feature: 'tidy',
        },
        {
          text: 'Each note gives a summary and the key points, with where each one comes from.',
          feature: 'facts',
        },
        {
          text: 'Bower adds a line when something new follows from what you keep.',
          feature: 'join',
        },
      ],
      ask: [
        {
          text: '"Compare what these three say about the same question."',
          feature: 'request',
        },
      ],
      get: [
        {
          text: 'A note that sets the three side by side.',
          feature: 'request',
        },
      ],
    },
  },
  {
    slug: 'finished-things',
    title: 'Finished things',
    blurb: 'Put done projects away, and still find them.',
    kind: 'archives',
    acts: {
      add: [
        {
          text: 'Nothing new: the flat is signed and the search is over.',
          feature: 'pile',
        },
      ],
      files: [
        {
          text: 'Each note keeps its summary and key facts, so a finished thing is still easy to find.',
          feature: 'note',
        },
      ],
      ask: [
        {
          text: '"Move the flat search to Archives."',
          feature: 'request',
        },
      ],
      get: [
        {
          text: 'The folder moved to Archives at the next tidy-up. It stays in your Drive and in Bower.',
          feature: 'request',
        },
      ],
    },
  },
];

export function findExample(slug: string | undefined): Example | undefined {
  return EXAMPLES.find((example) => example.slug === slug);
}

export function exampleHref(slug: string): string {
  return `${LEARN_PATH}/${slug}`;
}

/** Whether `path` is Learn Bower or one of its example pages. */
export function isLearnPath(path: string): boolean {
  return path === LEARN_PATH || path.startsWith(`${LEARN_PATH}/`);
}
