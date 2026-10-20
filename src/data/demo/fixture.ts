/**
 * Alex's Bower folder: made-up data for the demo and the tests. No real
 * person, address or document. Files' ages are relative to the moment the
 * demo starts, so "today" always means today. Timeline dates are fixed text
 * ("28 Sep", or "Today"), written around 4 October 2026; a test keeps them
 * from being later than that.
 */
import type { FileKind, Pile, PileItem, Question, Rule, SetAside, Suggestion } from '../types';
import { tidiedRule } from '../spine/scripted';

export const ALEX = { name: 'Alex', email: 'you@example.com' };

const DAY = 86_400_000;
export interface Seed {
  path: string;
  kind?: FileKind;
  /** Days since it was last changed. */
  age: number;
  isNew?: boolean;
  byBower?: boolean;
  hub?: boolean;
}

/** Folders are implied by the paths; empty ones are listed with a trailing slash. */
export const SEEDS: Seed[] = [
  { path: 'Inbox/', age: 0 },
  { path: 'Projects/Flat hunt/Flat hunt.md', age: 1, byBower: true, hub: true },
  { path: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', age: 1, byBower: true },
  { path: 'Projects/Flat hunt/Flat 7, Cobble Row.md', age: 1, byBower: true },
  { path: 'Projects/Flat hunt/Flat 2, 40 Tanners Walk.md', age: 6, byBower: true },
  { path: 'Projects/Flat hunt/Lease draft.pdf', kind: 'pdf', age: 9 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2290.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2291.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2292.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Job hunt/Job hunt.md', age: 3, byBower: true, hub: true },
  { path: 'Projects/Job hunt/Applications/Senior Product Designer, Lumenfold.md', age: 3, byBower: true },
  { path: 'Projects/Job hunt/Applications/Design Lead, Quillstone.md', age: 11, byBower: true },
  { path: 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md', age: 15, byBower: true },
  { path: 'Projects/Job hunt/CV insights.md', age: 7, byBower: true },
  { path: 'Projects/Job hunt/CV 2026.pdf', kind: 'pdf', age: 40 },
  { path: 'Projects/Saltmere weekend/Saltmere weekend.md', age: 20, byBower: true, hub: true },
  { path: 'Projects/Saltmere weekend/Flights.pdf', kind: 'pdf', age: 21 },
  { path: 'Projects/Saltmere weekend/Hotel booking.pdf', kind: 'pdf', age: 21 },
  { path: 'Areas/Home/Home.md', age: 20, byBower: true, hub: true },
  { path: 'Areas/Home/Boiler service.md', age: 20, byBower: true },
  { path: 'Areas/Home/Boiler invoice.pdf', kind: 'pdf', age: 20 },
  { path: 'Areas/Home/Dishwasher warranty.pdf', kind: 'pdf', age: 70 },
  { path: 'Areas/Money/Money.md', age: 2, byBower: true, hub: true },
  { path: 'Areas/Money/Budget 2026.md', age: 8 },
  { path: 'Areas/Money/Receipts/2026-09/Taxi.pdf', kind: 'pdf', age: 14 },
  { path: 'Areas/Money/Receipts/2026-09/Hotel invoice.pdf', kind: 'pdf', age: 14 },
  { path: 'Areas/Money/Receipts/2026-09/Groceries.jpg', kind: 'image', age: 18 },
  { path: 'Areas/Money/Receipts/2026-10/IMG_3101.jpg', kind: 'image', age: 1, isNew: true },
  { path: 'Areas/Money/Payslips/Payslip August.pdf', kind: 'pdf', age: 34 },
  { path: 'Areas/Money/Payslips/Payslip September.pdf', kind: 'pdf', age: 4 },
  { path: 'Areas/Health/Health.md', age: 30, byBower: true, hub: true },
  { path: 'Areas/Health/Blood test, May.pdf', kind: 'pdf', age: 130 },
  { path: 'Areas/Health/Physio exercises.md', age: 45 },
  { path: 'Areas/Documents/Passport renewal.md', age: 15, byBower: true },
  { path: 'Areas/Documents/Passport copy.pdf', kind: 'pdf', age: 60 },
  { path: 'Areas/Car/Car.md', age: 50, byBower: true, hub: true },
  { path: 'Areas/Car/Insurance 2026.pdf', kind: 'pdf', age: 50 },
  { path: 'Areas/Car/MOT certificate.pdf', kind: 'pdf', age: 95 },
  { path: 'Resources/Cooking/Weeknight curry.md', age: 1, byBower: true, isNew: true },
  { path: 'Resources/Cooking/Sourdough, the short version.md', age: 25, byBower: true },
  { path: 'Resources/Cooking/Lemon tart.md', age: 33 },
  { path: 'Resources/Manuals/Dishwasher manual.pdf', kind: 'pdf', age: 90 },
  { path: 'Resources/Manuals/Router setup.pdf', kind: 'pdf', age: 120 },
  { path: 'Resources/Reading/Notes that grow.md', age: 60 },
  { path: 'Resources/Reading/Clipping, Four folders for everything.md', kind: 'note', age: 75 },
  { path: 'Resources/Ideas/Weekend projects.md', age: 10 },
  { path: 'Archive/Trips/Brackwater 2025.md', age: 300, byBower: true },
  { path: 'Archive/Trips/Brackwater 2025 receipts.pdf', kind: 'pdf', age: 300 },
  { path: 'Archive/Old flat/Inventory, Hatchmere Road.md', age: 400 },
  { path: 'Archive/Old flat/Deposit return.pdf', kind: 'pdf', age: 380 },
  { path: 'About me.md', age: 30 },
  { path: 'Rules.md', age: 2 },
];

export function seedTime(age: number, now: number): number {
  return now - age * DAY - 3_600_000 * ((age * 7) % 11);
}

export { NOTES } from './notes';

// ---------- the inbox: two piles and two loose things

export function seedPiles(now: number): Pile[] {
  return [
    {
      id: 'p1',
      text: 'Job offer and a flat near it. Compare the commute.',
      createdAt: now - 3 * 3_600_000,
      items: [
        { id: 'i1', name: 'Offer_letter_final(2).pdf', kind: 'pdf', origin: 'From Mail' },
        { id: 'i2', name: 'listing-88213.example', kind: 'link', origin: 'From the browser' },
        { id: 'i3', name: 'IMG_2301.jpg', kind: 'image', origin: 'From your phone' },
        { id: 'i4', name: 'Payslip_Aug.pdf', kind: 'pdf', origin: 'From Mail' },
      ],
    },
    {
      id: 'p2',
      text: 'Receipts from the Saltmere weekend',
      createdAt: now - 26 * 3_600_000,
      items: Array.from({ length: 9 }, (_, i) => ({
        id: `r${i}`,
        name: i === 5 ? 'Taxi.pdf' : i === 6 ? 'Hotel invoice (2).pdf' : `IMG_31${10 + i}.jpg`,
        kind: (i === 5 || i === 6 ? 'pdf' : 'image') as 'pdf' | 'image',
        origin: 'From your phone',
      })),
    },
    {
      id: 'p3',
      text: '',
      createdAt: now - 40 * 60_000,
      items: [{ id: 'l1', name: 'curry-clipping.example', kind: 'link', origin: 'From the browser' }],
    },
    {
      id: 'p4',
      text: '',
      createdAt: now - 20 * 60_000,
      items: [{ id: 'l2', name: 'Dentist reminder.pdf', kind: 'pdf', origin: 'From Mail' }],
    },
  ];
}

/** Where the simulated run sends each inbox thing, and what it calls it. */
export const FILING: Record<string, { title: string; to: string; note?: string }> = {
  i1: { title: 'Offer, Industrial Designer, Ferrowick.pdf', to: 'Projects/Job hunt/Applications', note: 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md' },
  i2: { title: 'Flat 9, Wrenfield Road.md', to: 'Projects/Flat hunt' },
  i3: { title: 'Wrenfield Road, kitchen.jpg', to: 'Projects/Flat hunt/Viewing photos' },
  i4: { title: 'Payslip August (2).pdf', to: 'Areas/Money/Payslips' },
  l1: { title: 'Weeknight curry, clipping.md', to: 'Resources/Cooking' },
  l2: { title: 'Dentist, 14 Oct.pdf', to: 'Areas/Health' },
  // The Saltmere receipts: named by what they are and their day, in the month of their date (the receipts rule).
  r0: { title: 'Saltmere weekend, fuel, 12 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r1: { title: 'Saltmere weekend, lunch, 12 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r2: { title: 'Saltmere weekend, parking, 12 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r3: { title: 'Saltmere weekend, groceries, 13 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r4: { title: 'Saltmere weekend, dinner, 13 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r5: { title: 'Saltmere weekend, taxi, 13 Sep.pdf', to: 'Areas/Money/Receipts/2026-09' },
  r6: { title: 'Saltmere weekend, hotel invoice, 14 Sep.pdf', to: 'Areas/Money/Receipts/2026-09' },
  r7: { title: 'Saltmere weekend, museum, 14 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
  r8: { title: 'Saltmere weekend, train, 14 Sep.jpg', to: 'Areas/Money/Receipts/2026-09' },
};
/** What a tidy-up does when you said yes to keeping one note: the thing joins it. */
export const MERGES: Array<{ question: string; item: string; into: string; title: string; line: string }> = [
  {
    question: 'q1',
    item: 'listing-88213.example',
    into: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md',
    title: 'Wrenfield Road listing.url',
    line: 'The Wrenfield Road listing is the same building; kept here, as you asked.',
  },
];

/**
 * A project note a full tidy-up brings up to date, and the Timeline line it gets. `cites` is the inbox thing (by
 * the name it was added under) the line is about: when this tidy-up files it, the line cites the note or file it
 * became (C06, TL-P2-40), the provenance W3C PROV calls "derived from" (https://www.w3.org/TR/prov-overview/).
 * A line `onlyCited` is written only then.
 */
export type HubUpdate = { path: string; what: string; cites?: string; onlyCited?: true };

/** The hub notes a full tidy-up brings up to date, as both the demo and the pretend runner do. */
export const HUB_UPDATES: readonly HubUpdate[] = [
  { path: 'Projects/Flat hunt/Flat hunt.md', what: 'A new listing added to the shortlist.', cites: 'listing-88213.example' },
  { path: 'Projects/Job hunt/Job hunt.md', what: 'New offer from Ferrowick: fully remote, 42,000 a year, start 2 November.', cites: 'Offer_letter_final(2).pdf' },
  // Across projects: the flat came in the same pile as the offer.
  { path: 'Projects/Job hunt/Job hunt.md', what: 'A flat from the same pile went to the flat hunt.', cites: 'listing-88213.example', onlyCited: true },
];

/** What a Timeline line cites for a thing filed by its plan: the note it became or got, otherwise the file itself. */
export function citedName(plan: { title: string; note?: string }): string {
  if (plan.title.endsWith('.md')) return plan.title.slice(0, -3);
  return plan.note ? (plan.note.split('/').pop() ?? plan.note).replace(/\.md$/, '') : plan.title;
}

/**
 * A request a tidy-up answers (the stand-in for Claude): matched on its words, and given only when every note it
 * `uses` is there; otherwise the plain done line stands. The answer names what was done, with links.
 * - `answer`: answered from your notes alone.
 * - `lookup` (C10): with the web allowed, a scripted web result goes into `uses[0]`'s Timeline, its address as the
 *   line's source and its day as the line's date (the derivation, its source and when, after W3C PROV); with the
 *   web off, the answer says honestly that nothing was looked up (`NOT_LOOKED_UP`).
 * - `compare` (C08): a generated note in `note.to`, a GFM table with one row per note it `uses` (rent, commute and
 *   status, read from each note) and the list of those sources; `{note}` in the answer is the note's name.
 */
export type ScriptedRequest =
  | { kind: 'answer'; asks: RegExp; uses: readonly string[]; answer: string }
  | { kind: 'compare'; asks: RegExp; uses: readonly string[]; note: { to: string; title: string; what: string }; answer: string }
  | { kind: 'lookup'; asks: RegExp; uses: readonly [string]; found: { text: string; url: string }; answer: string };

/** What a lookup says while the web is off, as it always is today: nothing was looked up. */
export const NOT_LOOKED_UP = 'Bower did not look anything up. Looking things up on the web is still to come.';

export const SCRIPTED_REQUESTS: readonly ScriptedRequest[] = [
  {
    kind: 'answer',
    asks: /\bwhich flat\b.*\bclosest\b.*\bferrowick\b/i,
    uses: ['Projects/Flat hunt/Flat 7, Cobble Row.md', 'Projects/Job hunt/Applications/Industrial Designer, Ferrowick.md'],
    answer: '[[Flat 7, Cobble Row]] has the shortest commute, 18 minutes. The [[Industrial Designer, Ferrowick]] job is fully remote, so no flat is closer to it.',
  },
  {
    kind: 'compare',
    asks: /\bcompare\b.*\bflats\b.*\bshortlist\b/i,
    uses: ['Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', 'Projects/Flat hunt/Flat 7, Cobble Row.md', 'Projects/Flat hunt/Flat 2, 40 Tanners Walk.md'],
    note: { to: 'Projects/Flat hunt', title: 'Flats on the shortlist, compared', what: 'A comparison you asked for.' },
    answer: 'Compared the three flats on the shortlist in [[{note}]].',
  },
  {
    kind: 'lookup',
    asks: /\bcouncil tax\b.*\b(flat 3|larkspur lane)\b/i,
    uses: ['Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md'],
    // A made-up address on a reserved name (RFC 2606): no real site.
    found: { text: 'Council tax band C, looked up on the web.', url: 'https://council-tax.example/bands/12-larkspur-lane' },
    answer: 'Council tax band C, found on the web. Added to [[Flat 3, 12 Larkspur Lane]] with its source.',
  },
];

/** The scripted request these words ask for, if any. */
export function scriptedRequest(text: string): ScriptedRequest | null {
  return SCRIPTED_REQUESTS.find((r) => r.asks.test(text)) ?? null;
}

/**
 * What a note you add can disagree with (C07, the stand-in for Claude): words matching `words` that give a different
 * amount from the stored note's property. The amount is the first `£` figure in each.
 */
export const DISAGREEMENTS: ReadonlyArray<{ id: string; words: RegExp; note: string; property: string; label: string }> = [
  { id: 'flat-3-rent', words: /\bflat 3\b.*\brent\b/i, note: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md', property: 'rent', label: 'the rent' },
];

/**
 * The question a tidy-up asks when a note you added (named `added`) disagrees with a stored one: its text links both
 * notes; null when they agree, or either gives no amount.
 */
export function disagreement(words: string, added: string, stored: { name: string; value: string | undefined }, rule: (typeof DISAGREEMENTS)[number], now: number): Question | null {
  const amount = (text: string | undefined): string | null => /£\s?\d[\d,]*(?:\.\d+)?/.exec(text ?? '')?.[0].replace(/\s/g, '') ?? null;
  const said = amount(words);
  const kept = amount(stored.value);
  if (!rule.words.test(words) || !said || !kept || said === kept) return null;
  return {
    id: `q-${rule.id}-${said.replace(/\D/g, '')}`,
    text: `[[${added}]] says ${rule.label} is ${said}, but [[${stored.name}]] says ${kept}. Is ${said} right?`,
    yes: `Yes, ${said}`,
    no: `No, ${kept}`,
    about: rule.note,
    askedAt: now,
  };
}

/**
 * The Timeline line answering a disagreement's question adds to the stored note (TL-P2-40, main 479d305): what you
 * said, never a revision of the note (that is P4). Null for any other question.
 */
export function disagreementAnswer(q: Pick<Question, 'id' | 'yes' | 'no'>, yes: boolean): { note: string; line: string } | null {
  const rule = DISAGREEMENTS.find((r) => q.id.startsWith(`q-${r.id}-`));
  const said = /£\s?\d[\d,]*(?:\.\d+)?/.exec(yes ? q.yes : q.no)?.[0].replace(/\s/g, '');
  return rule && said ? { note: rule.note, line: `You said ${rule.label} is ${yes ? 'now' : 'still'} ${said}.` } : null;
}

/** The question a tidy-up asks when it files the Saltmere receipts (the stand-in for Claude asking). */
export function saltmereQuestion(now: number): Question {
  return {
    id: 'q-saltmere',
    text: 'The Saltmere receipts went to Money by month. Keep a copy of the list in the Saltmere weekend note too?',
    yes: 'Yes, keep a copy',
    no: 'No, Money is enough',
    about: 'Projects/Saltmere weekend/Saltmere weekend.md',
    askedAt: now,
  };
}

/**
 * The demo's stand-in for a model asking where a pile goes (TL-P4-08 point 1): words that leave its place open between
 * two projects. The pile stays in the inbox with this question.
 */
export function askAbout(words: string): { text: string; yes: string; no: string } | null {
  return /\bflat or the job\b/i.test(words) ? { text: 'Is this for the flat hunt?', yes: 'Yes, the flat hunt', no: 'No, the job hunt' } : null;
}

/** The Saltmere receipts go by month, as the person's rule says. */
export const RECEIPTS_TO = 'Areas/Money/Receipts/2026-10';

/** Where a thing goes when nothing above names it: a guess from the pile's words (the stand-in for Claude). */
export function guessFolder(text: string, kind: string): string {
  const t = text.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/receipt|invoice|bill/, RECEIPTS_TO],
    [/flat|rent|lease|viewing/, 'Projects/Flat hunt'],
    [/job|offer|cv|interview/, 'Projects/Job hunt/Applications'],
    [/recipe|cook|soup|cake/, 'Resources/Cooking'],
    [/car|mot|insurance/, 'Areas/Car'],
    [/doctor|gp|dentist|health|blood/, 'Areas/Health'],
    [/passport|id card|certificate/, 'Areas/Documents'],
    [/saltmere|trip|flight|hotel/, 'Projects/Saltmere weekend'],
  ];
  for (const [re, to] of map) if (re.test(t)) return to;
  return kind === 'link' ? 'Resources/Reading' : 'Resources/Ideas';
}

export function seedQuestions(now: number): Question[] {
  return [
    {
      id: 'q1',
      text: 'Flat 3, 12 Larkspur Lane and the new Wrenfield Road listing look like the same building. Keep one note for both?',
      yes: 'Yes, merge',
      no: 'No, keep both',
      about: 'Projects/Flat hunt/Flat 3, 12 Larkspur Lane.md',
      askedAt: now - 2 * DAY,
      noChange: false,
    },
    {
      id: 'q2',
      text: 'Two receipts from Kittiwake Lettings look like the same holding deposit, paid twice. Keep both?',
      yes: 'Keep both',
      no: 'Keep one',
      askedAt: now - 2 * DAY,
      noChange: true,
    },
  ];
}

export function seedRules(now: number): Rule[] {
  return [
    {
      id: 'u1',
      text: 'Receipts and invoices for purchases go to Areas / Money / Receipts, in a folder per month of their date (YYYY-MM).',
      yourWords: 'receipts to money by month',
      since: now - 1 * DAY,
    },
    {
      id: 'u2',
      text: 'Score every job offer from 1 to 10 against CV insights, list the skills it asks for that the CV lacks, and add a row to the Job hunt table.',
      yourWords: 'score job offers against my cv and tell me what im missing',
      since: now - 5 * DAY,
    },
    {
      id: 'u3',
      text: 'Passports, ID cards and certificates go to Areas / Documents; tick their line in Passport renewal. Never write document numbers.',
      yourWords: 'keep my id papers together',
      since: now - 5 * DAY,
    },
  ];
}

/** How a tidy-up words a rule you typed (the demo knows a few; others get a tidied copy). */
export const RULE_WORDING: Record<string, string> = {
  'anything from the dentist goes in health': 'Letters, reminders and invoices from the dentist go to Areas / Health; add the appointment date to Health.',
  'keep car stuff together and remind me of renewals': 'Car documents go to Areas / Car; put every renewal or expiry date in the Car note under Current state.',
  'recipes always in cooking, vegetarian tag if no meat': 'Recipes go to Resources / Cooking; tag them #vegetarian when they have no meat or fish.',
  'never file anything from my bank, just tell me': 'Do not file bank statements; leave them in the inbox and ask about them in the report.',
};

export function wordRule(raw: string): string {
  return RULE_WORDING[raw.trim().toLowerCase()] ?? tidiedRule(raw);
}

// ---------- sample piles for the demo panel, each with where its things go

export interface SamplePile {
  label: string;
  text: string;
  items: Array<Omit<PileItem, 'id'> & { title: string; to: string }>;
  /** For a pile that is only a note: the note Bower writes and where. */
  note?: { title: string; to: string };
  /** A pile a tidy-up leaves in the inbox, and why (the demo sends nothing, so it is told). */
  setAside?: SetAside;
}

/** A pile about the car's insurance renewal; the write-it situation seeds it, so Car's news line cites its renewal notice. */
export const CAR_RENEWAL: SamplePile = {
  label: 'Car insurance renewal',
  text: 'Car insurance renewal, the new policy starts in July',
  items: [
    { name: 'Renewal_notice_2027.pdf', kind: 'pdf', origin: 'From Mail', title: 'Insurance renewal 2027.pdf', to: 'Areas/Car' },
    { name: 'Policy schedule.pdf', kind: 'pdf', origin: 'From Mail', title: 'Policy schedule 2027.pdf', to: 'Areas/Car' },
  ],
};

export const SAMPLE_PILES: SamplePile[] = [
  {
    label: 'Just a note',
    text: 'The bins go out on Tuesday nights from November, and the recycling every other week.',
    items: [],
    note: { title: 'Bins and recycling.md', to: 'Areas/Home' },
  },
  CAR_RENEWAL,
  {
    label: 'Letters from the GP',
    text: 'Blood test results and the referral the GP sent',
    items: [
      { name: 'scan_0041.pdf', kind: 'pdf', origin: 'From your phone', title: 'Blood test, October.pdf', to: 'Areas/Health' },
      { name: 'scan_0042.pdf', kind: 'pdf', origin: 'From your phone', title: 'Physio referral.pdf', to: 'Areas/Health' },
    ],
  },
  {
    label: 'Recipes from mum',
    text: 'Recipes mum sent, the soup is vegetarian',
    items: [
      { name: 'IMG_4012.jpg', kind: 'image', origin: 'From your phone', title: 'Lentil soup.jpg', to: 'Resources/Cooking' },
      { name: 'IMG_4013.jpg', kind: 'image', origin: 'From your phone', title: 'Apple cake.jpg', to: 'Resources/Cooking' },
      { name: 'IMG_4014.jpg', kind: 'image', origin: 'From your phone', title: 'Roast potatoes.jpg', to: 'Resources/Cooking' },
    ],
  },
  {
    label: 'Two more flats',
    text: 'Two more flats to compare with Larkspur Lane',
    items: [
      { name: 'listing-99102.example', kind: 'link', origin: 'From the browser', title: 'Flat 4, 9 Osier Close.md', to: 'Projects/Flat hunt' },
      { name: 'listing-99377.example', kind: 'link', origin: 'From the browser', title: 'Flat 1, 22 Pellow Street.md', to: 'Projects/Flat hunt' },
    ],
  },
  {
    label: 'A pile set aside',
    text: 'Bank letters for the mortgage',
    setAside: 'changed',
    items: [
      { name: 'Statement_March.pdf', kind: 'pdf', origin: 'From Mail', title: 'Bank statement, March.pdf', to: 'Areas/Money', changed: true },
      { name: 'Statement_April.pdf', kind: 'pdf', origin: 'From Mail', title: 'Bank statement, April.pdf', to: 'Areas/Money' },
    ],
  },
  {
    label: 'A job offer',
    text: '',
    items: [{ name: 'Offer - Studio Lead.pdf', kind: 'pdf', origin: 'From Mail', title: 'Offer, Studio Lead, Brackenridge.pdf', to: 'Projects/Job hunt/Applications' }],
  },
];

export function seedSuggestions(): Suggestion[] {
  return [
    { id: 's1', title: 'Recipes go to Resources / Cooking', why: 'The last three recipes went there: Weeknight curry, Sourdough and a clipping.' },
  ];
}
