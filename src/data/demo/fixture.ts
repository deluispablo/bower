/**
 * Alex's Bower folder: made-up data for the demo and the tests. No real
 * person, address or document. Dates are relative to the moment the demo
 * starts, so "today" always means today.
 */
import type { FileKind, Note, Pile, Question, Rule, Suggestion } from '../types';

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
  { path: 'Projects/Flat hunt/Flat 3, 12 Mill Lane.md', age: 1, byBower: true },
  { path: 'Projects/Flat hunt/Flat 7, Rosebery Ave.md', age: 1, byBower: true },
  { path: 'Projects/Flat hunt/Flat 2, 40 Canal Street.md', age: 6, byBower: true },
  { path: 'Projects/Flat hunt/Lease draft.pdf', kind: 'pdf', age: 9 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2290.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2291.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Flat hunt/Viewing photos/IMG_2292.jpg', kind: 'image', age: 12 },
  { path: 'Projects/Job hunt/Job hunt.md', age: 3, byBower: true, hub: true },
  { path: 'Projects/Job hunt/Applications/Senior Consultant, Altis.md', age: 3, byBower: true },
  { path: 'Projects/Job hunt/Applications/Product Lead, Northwind.md', age: 11, byBower: true },
  { path: 'Projects/Job hunt/Applications/Data Engineer, Fabrikam.md', age: 15, byBower: true },
  { path: 'Projects/Job hunt/CV insights.md', age: 7, byBower: true },
  { path: 'Projects/Job hunt/CV 2026.pdf', kind: 'pdf', age: 40 },
  { path: 'Projects/Lisbon trip/Lisbon trip.md', age: 20, byBower: true, hub: true },
  { path: 'Projects/Lisbon trip/Flights.pdf', kind: 'pdf', age: 21 },
  { path: 'Projects/Lisbon trip/Hotel booking.pdf', kind: 'pdf', age: 21 },
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
  { path: 'Areas/Visa & Immigration/Visa checklist.md', age: 15, byBower: true },
  { path: 'Areas/Visa & Immigration/Passport copy.pdf', kind: 'pdf', age: 60 },
  { path: 'Areas/Car/Car.md', age: 50, byBower: true, hub: true },
  { path: 'Areas/Car/Insurance 2026.pdf', kind: 'pdf', age: 50 },
  { path: 'Areas/Car/MOT certificate.pdf', kind: 'pdf', age: 95 },
  { path: 'Resources/Cooking/Weeknight curry.md', age: 1, byBower: true, isNew: true },
  { path: 'Resources/Cooking/Sourdough, the short version.md', age: 25, byBower: true },
  { path: 'Resources/Cooking/Lemon tart.md', age: 33 },
  { path: 'Resources/Manuals/Dishwasher manual.pdf', kind: 'pdf', age: 90 },
  { path: 'Resources/Manuals/Router setup.pdf', kind: 'pdf', age: 120 },
  { path: 'Resources/Reading/How to take smart notes.md', age: 60 },
  { path: 'Resources/Reading/Clipping, Building a second brain.md', kind: 'note', age: 75 },
  { path: 'Resources/Ideas/Weekend projects.md', age: 10 },
  { path: 'Archive/Trips/Porto 2025.md', age: 300, byBower: true },
  { path: 'Archive/Trips/Porto 2025 receipts.pdf', kind: 'pdf', age: 300 },
  { path: 'Archive/Old flat/Inventory, Mill Road.md', age: 400 },
  { path: 'Archive/Old flat/Deposit return.pdf', kind: 'pdf', age: 380 },
  { path: 'About me.md', age: 30 },
  { path: 'Rules.md', age: 2 },
];

export function seedTime(age: number, now: number): number {
  return now - age * DAY - 3_600_000 * ((age * 7) % 11);
}

// ---------- notes with real content; the rest get a short generated one

type NoteSeed = Omit<Note, 'path' | 'backlinks' | 'byBower' | 'title'> & { title?: string };

export const NOTES: Record<string, NoteSeed> = {
  'Projects/Flat hunt/Flat 3, 12 Mill Lane.md': {
    summary: 'Two-bed flat near the station, £1,450 a month, viewing done, waiting on the agent.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Flat' },
      { key: 'rent', label: 'Rent', value: '£1,450 a month' },
      { key: 'bedrooms', label: 'Bedrooms', value: '2' },
      { key: 'commute', label: 'Commute', value: '24 min to the office' },
      { key: 'agent', label: 'Agent', value: 'Harbour Lettings' },
    ],
    status: 'viewing done',
    tags: ['flat', 'shortlist'],
    currentState: [
      'Viewed on Saturday. Bright, quiet street, small second bedroom.',
      'The agent asked for references by Friday.',
      'Cheapest of the three for its size; the lease draft has a 12-month break clause.',
    ],
    body: '## Notes from the viewing\n\n- Boiler replaced last year.\n- Washing machine stays.\n- Parking permit costs £90 a year.\n\nCompare with [[Flat 7, Rosebery Ave]] and [[Flat 2, 40 Canal Street]].',
    timeline: [
      { date: 'Today', text: 'Lease draft read: 12-month break clause, deposit of five weeks.', source: 'Lease draft.pdf' },
      { date: '2 Oct', text: 'Viewing photos added.', source: 'IMG_2290.jpg' },
      { date: '29 Sep', text: 'Listing saved; rent and agent filled in.', source: 'flat-camden.example' },
    ],
    bowerNote: {
      text: 'The listing does not say whether bills are included. Similar flats on the same street ask £1,500 to £1,600, so the rent is fair.',
      source: 'both',
    },
    links: ['Projects/Flat hunt/Flat 7, Rosebery Ave.md', 'Projects/Flat hunt/Flat 2, 40 Canal Street.md', 'Projects/Flat hunt/Flat hunt.md'],
    original: 'Projects/Flat hunt/Lease draft.pdf',
  },
  'Projects/Flat hunt/Flat hunt.md': {
    summary: 'Looking for a two-bed under £1,600 within 30 minutes of the office, by December.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Project' },
      { key: 'deadline', label: 'Deadline', value: '1 Dec' },
      { key: 'budget', label: 'Budget', value: 'Up to £1,600' },
    ],
    status: 'active',
    tags: ['project'],
    currentState: [
      'Three flats on the list; Mill Lane is the favourite.',
      'References due on Friday.',
    ],
    body: '## What matters\n\n- Two bedrooms, one usable as an office.\n- Under 30 minutes to work.\n- Allows a bike inside.\n\n## Flats\n\n- [[Flat 3, 12 Mill Lane]]\n- [[Flat 7, Rosebery Ave]]\n- [[Flat 2, 40 Canal Street]]',
    timeline: [
      { date: 'Today', text: 'Mill Lane moved to "viewing done".', source: 'Flat 3, 12 Mill Lane' },
      { date: '28 Sep', text: 'Project started from a pile with three listings.' },
    ],
    links: ['Projects/Flat hunt/Flat 3, 12 Mill Lane.md', 'Projects/Flat hunt/Flat 7, Rosebery Ave.md', 'Projects/Flat hunt/Flat 2, 40 Canal Street.md'],
  },
  'Projects/Job hunt/Applications/Senior Consultant, Altis.md': {
    summary: 'Senior consultant role at Altis, applied 1 Oct, first interview booked.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Job offer' },
      { key: 'company', label: 'Company', value: 'Altis Consulting' },
      { key: 'salary', label: 'Salary', value: '£68,000 to £75,000' },
      { key: 'fit', label: 'Fit', value: '8 out of 10' },
      { key: 'where', label: 'Where', value: 'Hybrid, 2 days in the office' },
    ],
    status: 'interview',
    tags: ['job'],
    currentState: [
      'First interview on Thursday at 10:00, video call.',
      'Strong match on data strategy and client work; less on the public-sector experience they ask for.',
    ],
    body: '## Why it fits\n\n- Leads client projects, as in the last two roles.\n- Asks for SQL and cloud data platforms.\n\n## To prepare\n\n- A short story about the migration project.\n- Questions about travel.',
    timeline: [
      { date: '3 Oct', text: 'Interview invitation filed; status set to "interview".', source: 'Interview invitation.pdf' },
      { date: '1 Oct', text: 'Applied; fit scored against [[CV insights]].' },
    ],
    links: ['Projects/Job hunt/CV insights.md', 'Projects/Job hunt/Job hunt.md'],
  },
  'Areas/Money/Budget 2026.md': {
    summary: 'Monthly budget for 2026: rent, bills, savings target of £600 a month.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Budget' },
      { key: 'year', label: 'Year', value: '2026' },
    ],
    tags: ['money'],
    currentState: ['September came in £120 under budget, mostly on groceries.'],
    body: '## Each month\n\n| | Planned |\n| --- | --- |\n| Rent | £1,450 |\n| Bills | £180 |\n| Food | £400 |\n| Savings | £600 |',
    timeline: [{ date: '4 Oct', text: 'September receipts counted.', source: 'Receipts/2026-09' }],
    links: [],
  },
  'Resources/Cooking/Weeknight curry.md': {
    summary: 'A 30-minute chickpea and spinach curry for four.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Recipe' },
      { key: 'time', label: 'Time', value: '30 min' },
      { key: 'serves', label: 'Serves', value: '4' },
    ],
    tags: ['recipe', 'vegetarian'],
    currentState: [],
    body: '## Ingredients\n\n- 2 tins of chickpeas\n- 200 g spinach\n- 1 tin of coconut milk\n- Curry paste, onion, garlic\n\n## Method\n\n1. Soften the onion and garlic.\n2. Fry the paste for a minute.\n3. Add chickpeas and coconut milk; simmer 15 minutes.\n4. Stir in the spinach.',
    timeline: [{ date: 'Today', text: 'Saved from a clipping.', source: 'curry-clipping.example' }],
    links: [],
  },
  'Areas/Home/Boiler service.md': {
    summary: 'Yearly boiler service, last done 14 Sep by Northside Heating, next due September 2027.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Service' },
      { key: 'next', label: 'Next due', value: 'Sep 2027' },
      { key: 'cost', label: 'Cost', value: '£95' },
    ],
    tags: ['home'],
    currentState: ['Serviced 14 Sep; no faults. Pressure topped up.'],
    body: 'The engineer suggested bleeding the radiators before winter.',
    timeline: [{ date: '14 Sep', text: 'Invoice filed and next date set.', source: 'Boiler invoice.pdf' }],
    links: ['Areas/Home/Home.md'],
    original: 'Areas/Home/Boiler invoice.pdf',
  },
};

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
      text: 'Receipts from the Lisbon trip',
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
  i1: { title: 'Offer, Data Engineer, Fabrikam.pdf', to: 'Projects/Job hunt/Applications', note: 'Projects/Job hunt/Applications/Data Engineer, Fabrikam.md' },
  i2: { title: 'Flat 9, Station Road.md', to: 'Projects/Flat hunt' },
  i3: { title: 'Station Road, kitchen.jpg', to: 'Projects/Flat hunt/Viewing photos' },
  i4: { title: 'Payslip August (2).pdf', to: 'Areas/Money/Payslips' },
  l1: { title: 'Weeknight curry, clipping.md', to: 'Resources/Cooking' },
  l2: { title: 'Dentist, 14 Oct.pdf', to: 'Areas/Health' },
};
/** The Lisbon receipts go by month, as the person's rule says. */
export const RECEIPTS_TO = 'Areas/Money/Receipts/2026-10';

export function seedQuestions(now: number): Question[] {
  return [
    {
      id: 'q1',
      text: 'Flat 3, 12 Mill Lane and the new Station Road listing look like the same building. Keep one note for both?',
      yes: 'Yes, merge',
      no: 'No, keep both',
      about: 'Projects/Flat hunt/Flat 3, 12 Mill Lane.md',
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
    { id: 'u1', text: 'Receipts go to Money, by month', since: now - 1 * DAY },
    { id: 'u2', text: 'Score job offers against my CV', since: now - 5 * DAY },
    { id: 'u3', text: 'Keep my visa papers together', since: now - 5 * DAY },
  ];
}

export function seedSuggestions(): Suggestion[] {
  return [
    { id: 's1', title: 'Recipes go to Resources / Cooking', why: 'The last three recipes went there: Weeknight curry, Sourdough and a clipping.' },
  ];
}
