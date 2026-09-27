/**
 * The demo's Bower folder (#192): an invented person, Alex, with about
 * thirty English notes across PARA, an inbox of three items waiting for
 * Tidy up, a health report and a short Tell Bower history. Only ever held in
 * memory (`vault.ts`); nothing here is real, and nothing is saved.
 *
 * The rulebook, `Rules.md`, `About-Me.md` and the folder notes come straight
 * from `vault-template/`, so the demo starts from the same files a real
 * Bower folder does.
 */

import aboutMe from '../../../vault-template/About-Me.md?raw';
import rulebook from '../../../vault-template/CLAUDE.md?raw';
import rules from '../../../vault-template/Rules.md?raw';
import inboxNote from '../../../vault-template/0-Inbox/_Inbox.md?raw';
import projectsNote from '../../../vault-template/1-Projects/_Projects.md?raw';
import areasNote from '../../../vault-template/2-Areas/_Areas.md?raw';
import resourcesNote from '../../../vault-template/3-Resources/_Resources.md?raw';
import archivesNote from '../../../vault-template/4-Archives/_Archives.md?raw';
import answersNote from '../../../vault-template/Answers/_Answers.md?raw';
import clippingsNote from '../../../vault-template/Clippings/_Clippings.md?raw';

import type { SentItem } from '../tell.js';

export const DEMO_NAME = 'Alex';
export const DEMO_EMAIL = 'alex@example.com';
/** Tidy up runs a day in the demo, the same as a real instance's default. */
export const DEMO_QUOTA_LIMIT = 10;

export interface FixtureFile {
  /** `/`-joined path from the top of the Bower folder. */
  path: string;
  /** Text, or a `Blob` for an attachment. */
  content: string | Blob;
  /** Defaults to `text/markdown`. */
  mimeType?: string;
  modifiedTime: string;
}

/** `2026-09-<day>` at `hhmm`, UTC: the fixture's dates, all in one month. */
function at(day: number, hhmm = '0900'): string {
  const dd = String(day).padStart(2, '0');
  return `2026-09-${dd}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z`;
}

function note(
  path: string,
  day: number,
  tags: string,
  body: string,
  extra = '',
): FixtureFile {
  const date = `2026-09-${String(day).padStart(2, '0')}`;
  return {
    path,
    modifiedTime: at(day),
    content: `---\ntags: [${tags}]\ncreated: ${date}\nupdated: ${date}\n${extra}---\n\n${body.trim()}\n`,
  };
}

/** A drawing for the Garden note: the one image attachment. */
const GARDEN_PLAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 140" width="240" height="140">
<rect width="240" height="140" rx="8" fill="#eef4ea"/>
<rect x="16" y="16" width="96" height="48" rx="4" fill="#b9d7a8"/>
<rect x="128" y="16" width="96" height="48" rx="4" fill="#d9c9a3"/>
<rect x="16" y="76" width="208" height="48" rx="4" fill="#a8c7d7"/>
<text x="64" y="44" font-family="sans-serif" font-size="12" text-anchor="middle">Tomatoes</text>
<text x="176" y="44" font-family="sans-serif" font-size="12" text-anchor="middle">Herbs</text>
<text x="120" y="104" font-family="sans-serif" font-size="12" text-anchor="middle">Beans and squash</text>
</svg>
`;

/** A one-page PDF stub: enough bytes to be a PDF, nothing to render. */
const INVOICE_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

/** Where Tidy up files each inbox item (`run.ts`). */
export const INBOX_PLAN: ReadonlyMap<string, string> = new Map([
  ['0-Inbox/Tomato seedlings.md', '2-Areas/Garden/Tomato seedlings.md'],
  [
    '0-Inbox/Boiler service invoice.pdf',
    '2-Areas/Home/Boiler service invoice.pdf',
  ],
]);

/** The question already waiting in the inbox; its answer is scripted in `replies.ts`. */
export const INBOX_QUESTION =
  '0-Inbox/Bower - 2026-09-27 0815 What do I still need for Lisbon.md';

export const FIXTURE_FILES: readonly FixtureFile[] = [
  // --- Top of the folder -------------------------------------------------
  { path: 'CLAUDE.md', content: rulebook, modifiedTime: at(1) },
  { path: 'Rules.md', content: rules, modifiedTime: at(1) },
  { path: 'About-Me.md', content: aboutMe, modifiedTime: at(1) },
  note(
    'index.md',
    26,
    'meta, hub',
    `# Index

## Projects
- [[Lisbon Trip]]: a week in Lisbon in October
- [[Kitchen Refresh]]: paint, shelves and a new tap
- [[Half Marathon]]: race day in November

## Areas
- [[Home]], [[Health]], [[Money]], [[Garden]]

## Resources
- [[Cooking]], [[Reading list]], [[Packing light]]

## Archives
- [[Bike Repair]]

## Answers
- [[2026-09-21 Which subscriptions renew this autumn]]

## Meta
- [[About-Me]]
- [[log]]`,
  ),
  note(
    'log.md',
    26,
    'meta',
    `# Log

- 2026-09-01 · Folder created from the Bower template.
- 2026-09-12 · Filed · Flights and stays, Things to see in Lisbon
- 2026-09-18 · Filed · Paint colours, Quotes from fitters
- 2026-09-21 · Answered · Which subscriptions renew this autumn
- 2026-09-26 · Filed · Running log, Weeknight curry`,
  ),
  note(
    'Lint Report.md',
    27,
    'meta',
    `Sunday's check.

## To fix
- [ ] 2 notes without a domain tag: Packing light, Deep Work
- [ ] Possible duplicate: "Sourdough" and "Weeknight curry" share a shopping list
- [ ] Broken link in Weeknight curry: [[Spice list]] does not exist`,
    'notes: 34\nfindings: 3\nbrokenLinks: 1\n',
  ),

  // --- Inbox and clippings -----------------------------------------------
  { path: '0-Inbox/_Inbox.md', content: inboxNote, modifiedTime: at(1) },
  {
    path: '0-Inbox/Tomato seedlings.md',
    modifiedTime: at(27, '0740'),
    content: `Seedlings from the market: four tomato plants (two cherry, two beef), basil. Pot on this weekend, water every other day, move out after the last frost.\n`,
  },
  {
    path: '0-Inbox/Boiler service invoice.pdf',
    mimeType: 'application/pdf',
    modifiedTime: at(27, '0802'),
    content: new Blob([INVOICE_PDF], { type: 'application/pdf' }),
  },
  {
    path: INBOX_QUESTION,
    modifiedTime: at(27, '0815'),
    content: `---\ntags: [instruction]\ndate: 2026-09-27T08:15:00.000Z\nvia: app\n---\n\nWhat do I still need to sort out for the Lisbon trip?\n`,
  },
  note(
    '0-Inbox/Processed/Bower - 2026-09-20 0930 Start a reading list.md',
    20,
    'instruction',
    'Start a reading list with the books I mention.',
  ),
  {
    path: 'Clippings/_Clippings.md',
    content: clippingsNote,
    modifiedTime: at(1),
  },

  // --- Projects ------------------------------------------------------------
  {
    path: '1-Projects/_Projects.md',
    content: projectsNote,
    modifiedTime: at(1),
  },
  note(
    '1-Projects/Lisbon Trip/Lisbon Trip.md',
    24,
    'project, hub, travel',
    `# Lisbon Trip

A week in Lisbon, 14 to 21 October. Goal: rest, walk a lot, eat well.

- [[Flights and stays]]
- [[Things to see in Lisbon]]
- [[Packing list]]

## Still open
- Book the day trip to Sintra
- Travel insurance: check the card's cover`,
    'status: active\npinned: 2026-09-24T18:00:00.000Z\n',
  ),
  note(
    '1-Projects/Lisbon Trip/Flights and stays.md',
    12,
    'document, travel',
    `# Flights and stays

- Out: 14 Oct, 07:10, seat 14C. Back: 21 Oct, 19:45.
- Flat in Alfama, check-in from 15:00, host sends the door code the day before.

Part of [[Lisbon Trip]].`,
  ),
  note(
    '1-Projects/Lisbon Trip/Things to see in Lisbon.md',
    12,
    'reference, travel',
    `# Things to see in Lisbon

- Tram 28 early in the morning, before the queues
- Miradouro da Senhora do Monte at sunset
- LX Factory on Sunday
- A day in Sintra (book the palace ahead)

Related: [[Packing light]], [[Lisbon Trip]].`,
  ),
  note(
    '1-Projects/Lisbon Trip/Packing list.md',
    22,
    'inventory, travel',
    `# Packing list

- [x] Walking shoes
- [x] Adapter
- [ ] Light rain jacket
- [ ] Printed insurance details

See [[Packing light]].`,
  ),
  note(
    '1-Projects/Kitchen Refresh/Kitchen Refresh.md',
    18,
    'project, hub, home',
    `# Kitchen Refresh

Paint, two open shelves and a new tap before the end of November.

- [[Paint colours]]
- [[Quotes from fitters]]

Budget: see [[Monthly budget]].`,
    'status: active\n',
  ),
  note(
    '1-Projects/Kitchen Refresh/Paint colours.md',
    18,
    'note, home',
    `# Paint colours

Shortlist: a warm white for the walls, sage green for the cupboard doors. Test pots bought; decide after a week of looking at them in daylight.

Part of [[Kitchen Refresh]].`,
  ),
  note(
    '1-Projects/Kitchen Refresh/Quotes from fitters.md',
    18,
    'document, home, finance',
    `# Quotes from fitters

| Fitter | Shelves and tap | Available |
| --- | --- | --- |
| First quote | 420 | Mid October |
| Second quote | 365 | November |

The second one is cheaper but after the trip. Part of [[Kitchen Refresh]].`,
  ),
  note(
    '1-Projects/Half Marathon/Half Marathon.md',
    20,
    'project, hub, health',
    `# Half Marathon

Race day: 16 November. Target: finish under two hours, enjoy it.

- [[Training plan]]
- [[Running log]]`,
    'status: active\n',
  ),
  note(
    '1-Projects/Half Marathon/Training plan.md',
    20,
    'guide, health',
    `# Training plan

- Tuesday: 5 km easy
- Thursday: intervals, 6 × 800 m
- Sunday: long run, adding 1 km a week up to 18 km

Taper the last ten days. Log every run in [[Running log]].`,
  ),

  // --- Areas ---------------------------------------------------------------
  { path: '2-Areas/_Areas.md', content: areasNote, modifiedTime: at(1) },
  note(
    '2-Areas/Home/Home.md',
    15,
    'area, hub, home',
    `# Home

- [[Boiler]]
- [[Bills and renewals]]
- Project: [[Kitchen Refresh]]`,
  ),
  note(
    '2-Areas/Home/Boiler.md',
    15,
    'document, home',
    `# Boiler

Serviced once a year, in September. Last service: September last year. The engineer's number is on the sticker under the boiler.

Part of [[Home]].`,
  ),
  note(
    '2-Areas/Home/Bills and renewals.md',
    21,
    'inventory, home, finance',
    `# Bills and renewals

- Home insurance: renews 3 November
- Broadband: contract ends in January
- Streaming: monthly, cancel after the series ends

See [[2026-09-21 Which subscriptions renew this autumn]].`,
  ),
  note(
    '2-Areas/Health/Health.md',
    10,
    'area, hub, health',
    `# Health

- [[Running log]]
- Project: [[Half Marathon]]
- Dentist check-up due in December.`,
  ),
  note(
    '2-Areas/Health/Running log.md',
    26,
    'inventory, health',
    `# Running log

| Date | Distance | Notes |
| --- | --- | --- |
| 2026-09-21 | 12 km | Easy, felt good |
| 2026-09-23 | 5 km | Legs tired |
| 2026-09-26 | 6 × 800 m | Right on pace |

Plan: [[Training plan]].`,
  ),
  note(
    '2-Areas/Money/Money.md',
    8,
    'area, hub, finance',
    `# Money

- [[Monthly budget]]
- [[Bills and renewals]]`,
  ),
  note(
    '2-Areas/Money/Monthly budget.md',
    8,
    'guide, finance',
    `# Monthly budget

Rent, bills and food first; then 10% saved on payday; the rest is free. The kitchen and the trip come out of savings this autumn.`,
  ),
  note(
    '2-Areas/Garden/Garden.md',
    14,
    'area, hub, hobby',
    `# Garden

The small back garden: three beds and a herb corner.

![[Garden plan.svg]]

- [[Watering schedule]]`,
  ),
  {
    path: '2-Areas/Garden/Garden plan.svg',
    mimeType: 'image/svg+xml',
    modifiedTime: at(14),
    content: new Blob([GARDEN_PLAN_SVG], { type: 'image/svg+xml' }),
  },
  note(
    '2-Areas/Garden/Watering schedule.md',
    14,
    'guide, hobby',
    `# Watering schedule

Early morning, every other day in summer, twice a week from October. The herbs need less than you think. Part of [[Garden]].`,
  ),

  // --- Resources -----------------------------------------------------------
  {
    path: '3-Resources/_Resources.md',
    content: resourcesNote,
    modifiedTime: at(1),
  },
  note(
    '3-Resources/Cooking/Cooking.md',
    26,
    'hub, hobby',
    `# Cooking

- [[Weeknight curry]]
- [[Sourdough]]`,
  ),
  note(
    '3-Resources/Cooking/Weeknight curry.md',
    26,
    'guide, hobby',
    `# Weeknight curry

**Thirty minutes, one pan.** Onion, garlic, ginger, a tin of tomatoes, a tin of chickpeas, spinach at the end. Spices from the [[Spice list]].`,
  ),
  note(
    '3-Resources/Cooking/Sourdough.md',
    16,
    'guide, hobby',
    `# Sourdough

**A loaf a week.** Feed the starter the night before; mix at 9, fold four times, shape at 3, bake next morning at 250 °C.`,
  ),
  note(
    '3-Resources/Books/Reading list.md',
    20,
    'inventory, learning',
    `# Reading list

- [[Deep Work]] (reading now)
- A history of Portugal, before the trip
- Something light for the flight`,
  ),
  note(
    '3-Resources/Books/Deep Work.md',
    22,
    'summary',
    `# Deep Work

**Focus without distraction is rare and valuable.** Schedule deep blocks, batch the shallow work, and treat attention as something to train.

How it applies: two mornings a week without messages. From the [[Reading list]].`,
  ),
  note(
    '3-Resources/Travel/Packing light.md',
    11,
    'guide',
    `# Packing light

One carry-on: three tops, two bottoms, one layer, shoes you can walk all day in. Roll, do not fold. Used for [[Lisbon Trip]].`,
  ),

  // --- Archives and answers ------------------------------------------------
  {
    path: '4-Archives/_Archives.md',
    content: archivesNote,
    modifiedTime: at(1),
  },
  note(
    '4-Archives/Bike Repair/Bike Repair.md',
    5,
    'project, hub, hobby',
    `# Bike Repair

Done in August: new chain, brake pads and a tune-up. Kept for the receipts.`,
    'status: archived\n',
  ),
  { path: 'Answers/_Answers.md', content: answersNote, modifiedTime: at(1) },
  // Two suggestions waiting for Alex, so Health shows Accept and Dismiss
  // (#199), and one already dismissed, which the list leaves out.
  note(
    'Answers/Bower - Proposals.md',
    26,
    'meta',
    `# Bower - Proposals

## Recipes go to Cooking
- id: 2026-09-26-recipes
- kind: rule
- text: File every recipe under 3-Resources/Cooking with the tag cooking.
- evidence: The last three recipes went there: [[Weeknight curry]], [[Sourdough]] and one from a clipping.
- status: open
- created: 2026-09-26

## Runs go to the running log
- id: 2026-09-26-runs
- kind: workflow
- text: When a run is recorded, add its date, distance and time to [[Running log]] and link it from [[Half Marathon]].
- evidence: Three runs added to [[Running log]] by hand this month.
- status: open
- created: 2026-09-26

## A tag for bills
- id: 2026-09-12-bills-tag
- kind: tag
- text: Use the domain tag bills for invoices and renewals.
- evidence: Used on [[Bills and renewals]].
- status: dismissed
- created: 2026-09-12
- decided: 2026-09-13`,
  ),
  note(
    'Answers/2026-09-21 Which subscriptions renew this autumn.md',
    21,
    'answer, finance',
    `# Which subscriptions renew this autumn?

Home insurance on 3 November, and the streaming service every month until you cancel it. Broadband runs until January. From [[Bills and renewals]].

Missing: no note says what the insurance cost last year.`,
  ),
];

/** The Tell Bower history the demo starts with, newest first. */
export const FIXTURE_SENT: readonly SentItem[] = [
  {
    name: 'Bower - 2026-09-27 0815 What do I still need for Lisbon.md',
    text: 'What do I still need to sort out for the Lisbon trip?',
    sentAt: '2026-09-27T08:15:00.000Z',
  },
  {
    name: 'Bower - 2026-09-20 0930 Start a reading list.md',
    text: 'Start a reading list with the books I mention.',
    sentAt: '2026-09-20T09:30:00.000Z',
  },
];
