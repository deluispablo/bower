/**
 * The contents of Alex's notes: made up, but written the way Bower writes
 * (summary, properties, current state, timeline citing sources) so every
 * screen shows the real thing. Wikilinks use note names, as in Obsidian.
 */
import type { Note } from '../types';

export type NoteSeed = Omit<Note, 'path' | 'backlinks' | 'byBower' | 'title'> & { title?: string };

const P = 'Projects';
const A = 'Areas';
const R = 'Resources';

export const NOTES: Record<string, NoteSeed> = {
  // ---------- Projects / Flat hunt
  [`${P}/Flat hunt/Flat hunt.md`]: {
    summary: 'Looking for a two-bed under £1,600 within 30 minutes of the office, moving by 1 December.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Project' },
      { key: 'due', label: 'Due', value: '1 Dec' },
      { key: 'budget', label: 'Budget', value: 'Up to £1,600 a month' },
    ],
    status: 'active',
    tags: ['project'],
    currentState: ['Three flats on the shortlist; [[Flat 3, 12 Larkspur Lane]] is the favourite.', 'References are due on Friday.', 'Notice on the current flat must be given by 31 October.'],
    body: `## What matters

- Two bedrooms, one usable as an office
- Under 30 minutes to work
- A bike can go inside

## Shortlist

| Flat | Rent | Commute | Status |
| --- | --- | --- | --- |
| [[Flat 3, 12 Larkspur Lane]] | £1,450 | 24 min | viewing done |
| [[Flat 7, Cobble Row]] | £1,580 | 18 min | viewing booked |
| [[Flat 2, 40 Tanners Walk]] | £1,390 | 35 min | maybe |

## Next steps

- [x] Ask the bank for a reference letter
- [ ] Send references to Kittiwake Lettings by Friday
- [ ] Give notice on the current flat by 31 October
- [ ] Book a van for the last weekend of November`,
    timeline: [
      { date: '28 Sep', text: 'Project started from a pile with three listings.' },
      { date: '2 Oct', text: 'Viewing photos of Larkspur Lane filed.', source: 'IMG_2290.jpg' },
      { date: 'Today', text: 'Larkspur Lane moved to "viewing done"; references due Friday.', source: 'Lease draft.pdf' },
    ],
    links: [`${P}/Flat hunt/Flat 3, 12 Larkspur Lane.md`, `${P}/Flat hunt/Flat 7, Cobble Row.md`, `${P}/Flat hunt/Flat 2, 40 Tanners Walk.md`],
  },
  [`${P}/Flat hunt/Flat 3, 12 Larkspur Lane.md`]: {
    summary: 'Two-bed flat near the station, £1,450 a month, viewing done, waiting on the agent.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Flat' },
      { key: 'rent', label: 'Rent', value: '£1,450 a month' },
      { key: 'bedrooms', label: 'Bedrooms', value: '2' },
      { key: 'commute', label: 'Commute', value: '24 min' },
      { key: 'agent', label: 'Agent', value: 'Kittiwake Lettings' },
    ],
    status: 'viewing done',
    tags: ['flat', 'shortlist'],
    currentState: ['Viewed on Saturday. Bright, quiet street, small second bedroom.', 'The agent asked for references by Friday.', 'Cheapest of the three for its size; the lease has a 12-month break clause.'],
    body: `## Notes from the viewing

- Boiler replaced last year
- Washing machine stays
- Parking permit costs £90 a year

## To ask the agent

- [x] Are bills included?
- [ ] Can we paint the second bedroom?
- [ ] Is there storage for two bikes?

Compare with [[Flat 7, Cobble Row]] and [[Flat 2, 40 Tanners Walk]].`,
    timeline: [
      { date: '29 Sep', text: 'Listing saved; rent and agent filled in.', source: 'flat-listing.example' },
      { date: '2 Oct', text: 'Viewing photos added.', source: 'IMG_2290.jpg' },
      { date: 'Today', text: 'Lease draft read: 12-month break clause, deposit of five weeks.', source: 'Lease draft.pdf' },
    ],
    bowerNote: { text: 'The listing does not say whether bills are included. Similar flats on the same street ask £1,500 to £1,600, so the rent is fair.', source: 'both' },
    links: [`${P}/Flat hunt/Flat 7, Cobble Row.md`, `${P}/Flat hunt/Flat 2, 40 Tanners Walk.md`, `${P}/Flat hunt/Flat hunt.md`],
    original: `${P}/Flat hunt/Lease draft.pdf`,
  },
  [`${P}/Flat hunt/Flat 7, Cobble Row.md`]: {
    summary: 'Top-floor two-bed with a balcony, £1,580 a month, 18 minutes to work; viewing on Thursday.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Flat' },
      { key: 'rent', label: 'Rent', value: '£1,580 a month' },
      { key: 'bedrooms', label: 'Bedrooms', value: '2' },
      { key: 'commute', label: 'Commute', value: '18 min' },
      { key: 'agent', label: 'Agent', value: 'Hollin & Rowe' },
    ],
    status: 'viewing booked',
    tags: ['flat', 'shortlist'],
    currentState: ['Viewing on Thursday at 18:30.', 'Closest to work, but the top floor has no lift.'],
    body: `## Before the viewing

- [ ] Check the water pressure upstairs
- [ ] Ask about the service charge
- [ ] Measure the second bedroom for a desk`,
    timeline: [
      { date: '1 Oct', text: 'Listing saved; viewing booked for Thursday.', source: 'cobble-row-listing.example' },
      { date: 'Today', text: 'Lease terms compared.', source: 'Lease draft.pdf|Lease copy.pdf' },
      { date: 'Today', text: 'Viewing photos compared.', source: 'Viewing photos' },
    ],
    links: [`${P}/Flat hunt/Flat hunt.md`, `${P}/Flat hunt/Flat 3, 12 Larkspur Lane.md`],
  },
  [`${P}/Flat hunt/Flat 2, 40 Tanners Walk.md`]: {
    summary: 'Cheapest option at £1,390 a month, but 35 minutes to work; kept as a fallback.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Flat' },
      { key: 'rent', label: 'Rent', value: '£1,390 a month' },
      { key: 'bedrooms', label: 'Bedrooms', value: '2' },
      { key: 'commute', label: 'Commute', value: '35 min' },
    ],
    status: 'maybe',
    tags: ['flat'],
    currentState: ['Over the 30-minute limit set in [[Flat hunt]]; kept in case the others fall through.'],
    body: 'Ground floor with a small garden. Damp mentioned in two reviews of the building.',
    timeline: [{ date: '28 Sep', text: 'Listing saved from the first pile of the flat hunt.' }],
    bowerNote: { text: 'Two reviews of the building mention damp in winter.', source: 'web' },
    links: [`${P}/Flat hunt/Flat hunt.md`],
  },

  // ---------- Projects / Job hunt
  [`${P}/Job hunt/Job hunt.md`]: {
    summary: 'Looking for a senior design role in Wrenmouth, hybrid, from £55,000; three applications open.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Project' },
      { key: 'due', label: 'Due', value: '31 Dec' },
    ],
    status: 'active',
    tags: ['project', 'career'],
    currentState: ['First interview with Lumenfold on Thursday.', 'Quillstone has not answered in 11 days.', 'Skills asked for most often: design for manufacture, sustainable materials, client presentations.'],
    body: `## Applications

| Role | Fit | Status |
| --- | --- | --- |
| [[Senior Product Designer, Lumenfold]] | 8 | interview |
| [[Design Lead, Quillstone]] | 6 | applied |
| [[Industrial Designer, Ferrowick]] | 7 | new |

## This week

- [x] Update the CV with the migration project
- [ ] Prepare the Lumenfold interview story
- [ ] Chase Quillstone`,
    timeline: [
      { date: '15 Sep', text: 'Project started.' },
      { date: '1 Oct', text: 'Applied to Lumenfold; fit scored against [[CV insights]].' },
      { date: '3 Oct', text: 'Interview invitation from Lumenfold.', source: 'Interview invitation.pdf' },
    ],
    links: [`${P}/Job hunt/Applications/Senior Product Designer, Lumenfold.md`, `${P}/Job hunt/Applications/Design Lead, Quillstone.md`, `${P}/Job hunt/Applications/Industrial Designer, Ferrowick.md`, `${P}/Job hunt/CV insights.md`],
  },
  [`${P}/Job hunt/Applications/Senior Product Designer, Lumenfold.md`]: {
    summary: 'Senior product designer role at Lumenfold, applied 1 Oct, first interview on Thursday.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Job offer' },
      { key: 'company', label: 'Company', value: 'Lumenfold Studio' },
      { key: 'salary', label: 'Salary', value: '£68,000 to £75,000' },
      { key: 'fit', label: 'Fit', value: '8 out of 10' },
      { key: 'where', label: 'Where', value: 'Hybrid, 2 days in the office' },
    ],
    status: 'interview',
    tags: ['job'],
    currentState: ['First interview on Thursday at 10:00, video call.', 'Strong match on lighting and furniture work; weaker on the medical devices experience they ask for.'],
    body: `## Why it fits

- Leads client projects, as in the last two roles
- Asks for 3D modelling and rapid prototyping

## To prepare

- [x] Read their last two case studies
- [ ] A short story about the desk lamp redesign
- [ ] Questions about travel`,
    timeline: [
      { date: '1 Oct', text: 'Applied; fit scored against [[CV insights]].' },
      { date: '3 Oct', text: 'Interview invitation filed; status set to "interview".', source: 'Interview invitation.pdf' },
    ],
    links: [`${P}/Job hunt/CV insights.md`, `${P}/Job hunt/Job hunt.md`],
  },
  [`${P}/Job hunt/Applications/Design Lead, Quillstone.md`]: {
    summary: 'Design lead for a kitchenware range at Quillstone; applied 23 Sep, no answer yet.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Job offer' },
      { key: 'company', label: 'Company', value: 'Quillstone' },
      { key: 'salary', label: 'Salary', value: '£70,000' },
      { key: 'fit', label: 'Fit', value: '6 out of 10' },
    ],
    status: 'applied',
    tags: ['job'],
    currentState: ['Applied on 23 September; no answer in 11 days.', 'More management than hands-on design; missing team-lead experience.'],
    body: 'Found through a recruiter. The role reports to the head of product.',
    timeline: [{ date: '23 Sep', text: 'Applied; fit scored against [[CV insights]].' }],
    links: [`${P}/Job hunt/CV insights.md`],
  },
  [`${P}/Job hunt/Applications/Industrial Designer, Ferrowick.md`]: {
    summary: 'Industrial designer offer from Ferrowick, £42,000, fully remote; new, not yet answered.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Job offer' },
      { key: 'company', label: 'Company', value: 'Ferrowick' },
      { key: 'salary', label: 'Salary', value: '£42,000' },
      { key: 'fit', label: 'Fit', value: '7 out of 10' },
      { key: 'where', label: 'Where', value: 'Remote' },
    ],
    status: 'new',
    tags: ['job'],
    currentState: ['Offer letter received; answer expected within two weeks.', 'Good match on prototyping and materials; less client work than Alex wants.'],
    body: '',
    timeline: [{ date: '15 Sep', text: 'Job advert saved and scored against [[CV insights]].' }],
    links: [`${P}/Job hunt/CV insights.md`, `${P}/Job hunt/Job hunt.md`],
  },
  [`${P}/Job hunt/CV insights.md`]: {
    summary: 'What the CV shows and what job offers keep asking for: the base for every fit score.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Profile' }],
    tags: ['career'],
    currentState: ['Strong: client projects, 3D modelling, prototyping, mentoring.', 'Gaps asked for in 3 of the last 5 offers: design for manufacture, sustainable materials.'],
    body: `## Skills asked for most

| Skill | Offers asking | On the CV |
| --- | --- | --- |
| 3D modelling | 5 | yes |
| Design for manufacture | 3 | no |
| Sustainable materials | 3 | no |
| Client presentations | 4 | yes |`,
    timeline: [{ date: '1 Oct', text: 'Tally updated with the Lumenfold offer.' }],
    links: [],
    original: `${P}/Job hunt/CV 2026.pdf`,
  },

  // ---------- Projects / Saltmere weekend
  [`${P}/Saltmere weekend/Saltmere weekend.md`]: {
    summary: 'Long weekend in Saltmere, 7 to 10 November: flights and hotel booked.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Trip' },
      { key: 'dates', label: 'Dates', value: '7 to 10 Nov' },
    ],
    status: 'active',
    tags: ['travel'],
    currentState: ['Flights and hotel booked; nothing else planned yet.'],
    body: `## Packing

- [ ] Passport
- [ ] Adapter
- [x] Walking shoes
- [ ] Book for the plane

## Ideas

- The cliff railway early in the morning
- Dinner by the harbour`,
    timeline: [
      { date: '13 Sep', text: 'Flights booked.', source: 'Flights.pdf' },
      { date: '13 Sep', text: 'Hotel booked, 3 nights.', source: 'Hotel booking.pdf' },
    ],
    links: [],
  },

  // ---------- Areas
  [`${A}/Home/Home.md`]: {
    summary: 'The current flat: services, appliances and what is due.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Area' }],
    tags: ['home'],
    currentState: ['Boiler serviced in September; next service September 2027.', 'Dishwasher warranty runs until March 2027.'],
    body: `## Due

- [x] Boiler service
- [ ] Bleed the radiators before winter
- [ ] Renew contents insurance in January`,
    timeline: [{ date: '14 Sep', text: 'Boiler service filed.', source: 'Boiler invoice.pdf' }],
    links: [`${A}/Home/Boiler service.md`],
  },
  [`${A}/Home/Boiler service.md`]: {
    summary: 'Yearly boiler service, last done 14 Sep by Fenwright Heating, next due September 2027.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Service' },
      { key: 'next', label: 'Next due', value: 'Sep 2027' },
      { key: 'cost', label: 'Cost', value: '£95' },
    ],
    tags: ['home'],
    currentState: ['Serviced 14 Sep; no faults. Pressure topped up.'],
    body: 'The engineer suggested bleeding the radiators before winter.',
    timeline: [{ date: '14 Sep', text: 'Invoice filed and next date set.', source: 'Boiler invoice.pdf' }],
    links: [`${A}/Home/Home.md`],
    original: `${A}/Home/Boiler invoice.pdf`,
  },
  [`${A}/Money/Money.md`]: {
    summary: 'Budget, payslips and receipts, filed by month.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Area' }],
    tags: ['money'],
    currentState: ['September came in £120 under budget.', 'Receipts are filed by month, as your rule says.'],
    body: 'See [[Budget 2026]] for the monthly plan.',
    timeline: [{ date: '4 Oct', text: 'September receipts counted.' }],
    links: [`${A}/Money/Budget 2026.md`],
  },
  [`${A}/Money/Budget 2026.md`]: {
    summary: 'Monthly budget for 2026: rent, bills, food and £600 savings a month.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Budget' },
      { key: 'year', label: 'Year', value: '2026' },
    ],
    tags: ['money'],
    currentState: ['September came in £120 under budget, mostly on groceries.'],
    body: `## Each month

| | Planned |
| --- | --- |
| Rent | £1,450 |
| Bills | £180 |
| Food | £400 |
| Savings | £600 |

## October

- [x] Move £600 to savings
- [ ] Cancel the old gym membership`,
    timeline: [{ date: '4 Oct', text: 'September receipts counted.' }],
    links: [`${A}/Money/Money.md`],
  },
  [`${A}/Health/Health.md`]: {
    summary: 'GP, dentist, blood tests and the physio routine.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Area' }],
    tags: ['health'],
    currentState: ['Dentist check-up on 14 October.', 'Blood test in May was normal.'],
    body: 'Physio routine in [[Physio exercises]].',
    timeline: [{ date: '20 May', text: 'Blood test results filed.', source: 'Blood test, May.pdf' }],
    links: [`${A}/Health/Physio exercises.md`],
  },
  [`${A}/Health/Physio exercises.md`]: {
    summary: 'Daily knee exercises from the physio, 10 minutes.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Routine' }],
    tags: ['health'],
    currentState: [],
    body: `## Every morning

- [x] Wall sit, 3 × 30 s
- [x] Step-ups, 2 × 12
- [ ] Single-leg balance, 3 × 30 s
- [ ] Stretch, 2 minutes`,
    timeline: [],
    links: [`${A}/Health/Health.md`],
  },
  [`${A}/Documents/Passport renewal.md`]: {
    summary: 'Documents for the passport renewal due in March: 4 of 7 ready.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Checklist' },
      { key: 'due', label: 'Due', value: '1 Mar' },
    ],
    status: 'in progress',
    tags: ['documents'],
    currentState: ['4 of 7 things ready.', 'The witness for the photo form must have known Alex for two years.'],
    body: `## To send

- [x] Old passport
- [x] Two new photos
- [x] Proof of address
- [x] Application form, filled in
- [ ] Photo form signed by a witness
- [ ] Fee paid
- [ ] Appointment booked`,
    timeline: [
      { date: '5 Aug', text: 'Passport copy filed; numbers left out.', source: 'Passport copy.pdf' },
      { date: '4 Oct', text: 'Application form filled in.' },
    ],
    links: [],
  },
  [`${A}/Car/Car.md`]: {
    summary: 'The car: insurance until June, MOT due in January.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Area' }],
    tags: ['car'],
    currentState: ['Insurance runs until 30 June.', 'MOT due in January.'],
    body: `## Due

- [ ] Book the MOT for January
- [ ] Check the tyres before winter`,
    timeline: [{ date: '15 Aug', text: 'Insurance 2026 filed.', source: 'Insurance 2026.pdf' }],
    links: [],
  },

  // ---------- Resources
  [`${R}/Cooking/Weeknight curry.md`]: {
    summary: 'A 30-minute chickpea and spinach curry for four.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Recipe' },
      { key: 'time', label: 'Time', value: '30 min' },
      { key: 'serves', label: 'Serves', value: '4' },
    ],
    tags: ['recipe', 'vegetarian'],
    currentState: [],
    body: `## Ingredients

- [ ] 2 tins of chickpeas
- [ ] 200 g spinach
- [ ] 1 tin of coconut milk
- [ ] Curry paste, onion, garlic

## Method

1. Soften the onion and garlic.
2. Fry the paste for a minute.
3. Add chickpeas and coconut milk; simmer 15 minutes.
4. Stir in the spinach.`,
    timeline: [{ date: 'Today', text: 'Saved from a clipping.', source: 'curry-clipping.example' }],
    links: [],
  },
  [`${R}/Cooking/Sourdough, the short version.md`]: {
    summary: 'A same-day sourdough loaf, 7 hours from mixing to baking.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Recipe' },
      { key: 'time', label: 'Time', value: '7 h' },
    ],
    tags: ['recipe', 'baking'],
    currentState: [],
    body: `1. Mix 500 g flour, 350 g water, 100 g starter, 10 g salt.
2. Four folds, 30 minutes apart.
3. Shape, rest 2 hours, bake 45 minutes at 240 °C.`,
    timeline: [{ date: '9 Sep', text: 'Saved from a blog post.' }],
    links: [],
  },
  [`${R}/Cooking/Lemon tart.md`]: {
    summary: 'A lemon tart for six, written down from a friend.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Recipe' }],
    tags: ['recipe'],
    currentState: [],
    body: 'Blind-bake the case 15 minutes; the filling sets in 25 minutes at 160 °C.',
    timeline: [],
    links: [],
  },
  [`${R}/Reading/Notes that grow.md`]: {
    summary: 'Notes on the book: write in your own words and link each note to others.',
    properties: [
      { key: 'kind', label: 'Kind', value: 'Book' },
      { key: 'author', label: 'Author', value: 'Ida Marrow' },
    ],
    tags: ['reading'],
    currentState: [],
    body: '- One idea per note\n- Link before you file\n- See also [[Clipping, Four folders for everything]]',
    timeline: [],
    links: [`${R}/Reading/Clipping, Four folders for everything.md`],
  },
  [`${R}/Reading/Clipping, Four folders for everything.md`]: {
    summary: 'A clipped article on PARA: projects, areas, resources and archive.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Clipping' }],
    tags: ['reading'],
    currentState: [],
    body: 'Projects have an end; areas go on; resources are for later; the archive is for what is done.',
    timeline: [],
    links: [],
  },
  [`${R}/Ideas/Weekend projects.md`]: {
    summary: 'Small things to do on free weekends.',
    properties: [{ key: 'kind', label: 'Kind', value: 'List' }],
    tags: [],
    currentState: [],
    body: `- [ ] Fix the bike's back brake
- [x] Print the Saltmere photos
- [ ] Shelf for the hallway
- [ ] Try the sourdough recipe`,
    timeline: [],
    links: [],
  },

  // ---------- Archive
  [`Archive/Trips/Brackwater 2025.md`]: {
    summary: 'Four days in Porto in May 2025: what we spent and what we liked.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Trip' }],
    status: 'done',
    tags: ['travel'],
    currentState: ['Spent £740 in total.'],
    body: 'The old salt works were the highlight; the boat trip was skippable.',
    timeline: [{ date: '30 May 2025', text: 'Receipts filed.', source: 'Brackwater 2025 receipts.pdf' }],
    links: [],
  },
  [`Archive/Old flat/Inventory, Hatchmere Road.md`]: {
    summary: 'Check-out inventory of the previous flat; deposit returned in full.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Inventory' }],
    status: 'done',
    tags: ['home'],
    currentState: ['Deposit returned in full on 2 September 2025.'],
    body: '',
    timeline: [{ date: '2 Sep 2025', text: 'Deposit return filed.', source: 'Deposit return.pdf' }],
    links: [],
  },

  // ---------- Root
  'About me.md': {
    summary: 'Who Alex is, what matters now and how Bower should write.',
    properties: [{ key: 'kind', label: 'Kind', value: 'Profile' }],
    tags: [],
    currentState: [],
    body: `Alex is an industrial designer in Wrenmouth and lives with a partner and a cat.

## Right now

- Looking for a new flat by December ([[Flat hunt]])
- Looking for a senior design role ([[Job hunt]])
- Renewing the passport in March ([[Passport renewal]])

## How Bower should write

- Short notes, facts first, dates as "3 Oct"
- Money in pounds
- Never write passport or account numbers`,
    timeline: [],
    links: [`${P}/Flat hunt/Flat hunt.md`, `${P}/Job hunt/Job hunt.md`, `${A}/Documents/Passport renewal.md`],
  },
};
