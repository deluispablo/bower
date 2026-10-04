/**
 * Alex's Bower folder: made-up data for the demo and the tests. No real
 * person, address or document. Dates are relative to the moment the demo
 * starts, so "today" always means today.
 */
import type { FileKind, Pile, PileItem, Question, Rule, Suggestion } from '../types';

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
};
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
    },
    {
      id: 'q2',
      text: 'Receipts have gone to Money, by month, three times. Keep that as a rule?',
      yes: 'Keep as a rule',
      no: 'No thanks',
      askedAt: now - 2 * DAY,
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

/** Rules people often type, offered in the demo's Bower tab. */
export const SAMPLE_RULES = Object.keys(RULE_WORDING);

export function wordRule(raw: string): string {
  const known = RULE_WORDING[raw.trim().toLowerCase()];
  if (known) return known;
  const t = raw.trim().replace(/\s+/g, ' ');
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
}

// ---------- sample piles for the demo panel, each with where its things go

export interface SamplePile {
  label: string;
  text: string;
  items: Array<Omit<PileItem, 'id'> & { title: string; to: string }>;
  /** For a pile that is only a note: the note Bower writes and where. */
  note?: { title: string; to: string };
}

export const SAMPLE_PILES: SamplePile[] = [
  {
    label: 'Just a note',
    text: 'The bins go out on Tuesday nights from November, and the recycling every other week.',
    items: [],
    note: { title: 'Bins and recycling.md', to: 'Areas/Home' },
  },
  {
    label: 'Car insurance renewal',
    text: 'Car insurance renewal, the new policy starts in July',
    items: [
      { name: 'Renewal_notice_2027.pdf', kind: 'pdf', origin: 'From Mail', title: 'Insurance renewal 2027.pdf', to: 'Areas/Car' },
      { name: 'Policy schedule.pdf', kind: 'pdf', origin: 'From Mail', title: 'Policy schedule 2027.pdf', to: 'Areas/Car' },
    ],
  },
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
