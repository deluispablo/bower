/**
 * The demo's Bower folder (#192): an invented person, Alex, with about
 * thirty English notes across PARA, an inbox of three items waiting for
 * Tidy up, a health report and a short Tell Bower history. Only ever held in
 * memory (`vault.ts`); nothing here is real, and nothing is saved.
 *
 * The world is the v6 boards' (#903): Alex has moved to Melbourne. Projects
 * holds Housing Search Australia (Moonee Ponds, its Listings and six flat
 * notes Bower wrote) and Job Search Australia (Applications and four job
 * offers); Areas holds Visa & Immigration. Alex's earlier London life (the
 * flat hunt, the Lisbon trip, the kitchen, the half marathon, the old job)
 * is in Archives, and the household notes are in Resources: those folders
 * keep every file kind the explorer shows. The demo clock the dates are
 * written for is Wednesday 30 September 2026, around noon in London
 * (`e2e/demo.ts`): the last tidy-up finished 21 hours earlier.
 *
 * The rulebook, `Rules.md`, `About-Me.md` and the folder notes come straight
 * from `vault-template/`, so the demo starts from the same files a real
 * Bower folder does; `Rules.md` then gets a few rules of Alex's own
 * (`DEMO_RULES`), so the Bower tab's Rules screen has groups to show.
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

import type { Run, RunItem } from '../api.js';
import { buildRun } from './run-builders.js';
import type { ImageMediaMetadata, VideoMediaMetadata } from '../drive.js';

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
  /** Drive app properties the file carries (`bowerOrigin`, `file-origin.ts`). */
  appProperties?: Readonly<Record<string, string>>;
  /** The size Drive reports when it differs from the stub's own bytes. */
  size?: number;
  /** Drive's small picture of the file (`thumbnailLink`), when it has one. */
  thumbnailLink?: string;
  imageMediaMetadata?: ImageMediaMetadata;
  videoMediaMetadata?: VideoMediaMetadata;
  /** Drive previews this file in its own viewer (Office files, video). */
  preview?: boolean;
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

/** The fitter's quote, filed in Kitchen Refresh: a one-page PDF stub. */
const FITTER_QUOTE_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

/** The lease, filed in Flat hunt (#367, `Demo-Home`/`Demo-Add`/
 * `Demo-Working`/`Demo-Tidy-Confirm` boards): a one-page PDF stub. */
const LEASE_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

/** A photo of the paint test patch: a 1 × 1 PNG, enough to be a photo.
 * Hex rather than base64, which the sanitised-repo check would read as a
 * Drive folder id. */
const TEST_PATCH_PNG =
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf500f00038601805a347d6b0000000049454e44ae426082';

function pngBlob(hex: string): Blob {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new Blob([bytes], { type: 'image/png' });
}

/** Where Tidy up files each inbox item (`run.ts`). */
export const INBOX_PLAN: ReadonlyMap<string, string> = new Map([
  ['0-Inbox/Tomato seedlings.md', '3-Resources/Garden/Tomato seedlings.md'],
  [
    '0-Inbox/Boiler service invoice.pdf',
    '3-Resources/Home/Boiler service invoice.pdf',
  ],
]);

/** The question already waiting in the inbox; its answer is scripted in `replies.ts`. */
export const INBOX_QUESTION =
  '0-Inbox/Bower - 2026-09-27 0815 What do I still need for the visa.md';

/** One processed item of a run, in the report v2 shape (#583, R-RUN-4). */
function filed(path: string, to: string, renamedFrom?: string): RunItem {
  return {
    path,
    kind: 'file',
    to,
    ...(renamedFrom !== undefined && { renamedFrom }),
  };
}

/** A request the run answered (an instruction note, moved to Processed). */
function request(name: string): RunItem {
  return {
    path: `0-Inbox/${name}`,
    kind: 'request',
    to: `0-Inbox/Processed/${name}`,
  };
}

/**
 * A finished run: `finishedAt`, and `startedAt` `minutes` before it (R-API-4:
 * every run carries its start), requested a minute before that.
 */
function runOf(
  runId: string,
  finishedAt: string,
  items: readonly RunItem[],
  extra: Partial<Run> = {},
  minutes = 4,
): Run {
  const finished = new Date(finishedAt).getTime();
  const started = finished - minutes * 60_000;
  const files = items.filter((item) => item.kind === 'file').length;
  return {
    state: 'done',
    requestedAt: new Date(started - 60_000).toISOString(),
    startedAt: new Date(started).toISOString(),
    finishedAt,
    summary:
      files === 0
        ? 'Nothing new to file.'
        : `Filed ${files} ${files === 1 ? 'item' : 'items'}.`,
    processed: items.map((item) => item.path),
    items: items.map((item) => ({ ...item })),
    runId,
    ...extra,
  };
}

/** A run that did not finish: nothing moved, the inbox kept everything. */
function unfinished(runId: string, finishedAt: string, minutes: number): Run {
  const run = runOf(
    runId,
    finishedAt,
    [],
    { state: 'failed', error: 'agent: out of turns' },
    minutes,
  );
  delete run.summary;
  return run;
}

/** `2026-09-29` at `hhmm` London time (BST, UTC+1): yesterday on the demo clock. */
function yesterday(hhmm: string): string {
  const hours = String(Number(hhmm.slice(0, 2)) - 1).padStart(2, '0');
  return `2026-09-29T${hours}:${hhmm.slice(2)}:00.000Z`;
}

/** `2026-09-30` at `hhmm` London time (BST, UTC+1): today on the demo clock. */
function today(hhmm: string): string {
  const hours = String(Number(hhmm.slice(0, 2)) - 1).padStart(2, '0');
  return `2026-09-30T${hours}:${hhmm.slice(2)}:00.000Z`;
}

const HOUSING = '1-Projects/Housing Search Australia';
const MOONEE_PONDS = `${HOUSING}/Moonee Ponds`;
const LISTINGS = `${MOONEE_PONDS}/Listings`;
const JOBS = '1-Projects/Job Search Australia';
const APPLICATIONS = `${JOBS}/Applications`;
const VISA = '2-Areas/Visa & Immigration';

/**
 * The tidy-ups before the demo starts, newest first (boards JF-Main,
 * JF-Earlier, AR-Run, BW-Activity; London times): yesterday's ten, the last
 * of them 15:01 to 15:03, which filed "Passport copy" into Visa &
 * Immigration (Home: "Done 21 h ago: 1 filed."), then the older ones from
 * Alex's London folders. The first is also the demo's last run.
 */
export const DEMO_RUNS: readonly Run[] = [
  runOf(
    'demo-run-yesterday-10',
    yesterday('1503'),
    [filed('0-Inbox/Passport copy.pdf', `${VISA}/Passport copy.pdf`)],
    {},
    2,
  ),
  runOf(
    'demo-run-yesterday-9',
    yesterday('1355'),
    [
      filed(
        '0-Inbox/Senior Consultant - Data Engineer, Altis Consulting.md',
        `${APPLICATIONS}/Senior Consultant - Data Engineer, Altis Consulting.md`,
      ),
      filed(
        '0-Inbox/Lead Data Engineer, Clicks IT Recruitment.md',
        `${APPLICATIONS}/Lead Data Engineer, Clicks IT Recruitment.md`,
      ),
      filed('0-Inbox/Job ratings.md', `${APPLICATIONS}/Job ratings.md`),
      filed(
        '0-Inbox/Senior Data Engineer Team Lead, Allume Energy.md',
        `${APPLICATIONS}/Senior Data Engineer Team Lead, Allume Energy.md`,
      ),
      filed(
        '0-Inbox/Managing Consultant, Altis Consulting.md',
        `${APPLICATIONS}/Managing Consultant, Altis Consulting.md`,
      ),
      filed(
        '0-Inbox/Cover Letter - Senior Data Engineer Team Lead, Allume Energy.md',
        `${APPLICATIONS}/Cover Letter - Senior Data Engineer Team Lead, Allume Energy.md`,
      ),
    ],
    {},
    2,
  ),
  unfinished('demo-run-yesterday-8', yesterday('1344'), 7),
  runOf('demo-run-yesterday-7', yesterday('1320'), [], {}, 6),
  runOf(
    'demo-run-yesterday-6',
    yesterday('1301'),
    [
      filed(
        '0-Inbox/CV - Senior Data Engineer Team Lead, Allume Energy.md',
        `${APPLICATIONS}/CV - Senior Data Engineer Team Lead, Allume Energy.md`,
      ),
      filed(
        '0-Inbox/Cover Letter - Senior Consultant, Altis Consulting.md',
        `${APPLICATIONS}/Cover Letter - Senior Consultant, Altis Consulting.md`,
      ),
      filed(
        '0-Inbox/CV - Senior Consultant, Altis Consulting.md',
        `${APPLICATIONS}/CV - Senior Consultant, Altis Consulting.md`,
      ),
      filed(
        '0-Inbox/Cover Letter - Alex.pdf',
        `${JOBS}/Cover Letter - Alex.pdf`,
      ),
      filed('0-Inbox/CV insights.md', `${JOBS}/CV insights.md`),
    ],
    {},
    5,
  ),
  unfinished('demo-run-yesterday-5', yesterday('1252'), 7),
  runOf(
    'demo-run-yesterday-4',
    yesterday('1231'),
    [request('Bower - 2026-09-29 1228 Rate the job offers against my CV.md')],
    { summary: 'Answered 1 request.' },
    2,
  ),
  runOf(
    'demo-run-yesterday-3',
    yesterday('1223'),
    [
      filed('0-Inbox/LinkedIn profile.md', `${JOBS}/LinkedIn profile.md`),
      filed('0-Inbox/SEEK profile.md', `${JOBS}/SEEK profile.md`),
    ],
    {},
    1,
  ),
  runOf(
    'demo-run-yesterday-2',
    yesterday('1214'),
    [
      request('Bower - 2026-09-29 1209 Keep my visa papers together.md'),
      filed('0-Inbox/CV Australia.docx', `${JOBS}/CV Australia.docx`),
      filed('0-Inbox/Visa & Immigration.md', `${VISA}/Visa & Immigration.md`),
    ],
    {},
    4,
  ),
  runOf(
    'demo-run-yesterday-1',
    yesterday('1147'),
    [
      filed(
        '0-Inbox/Renting in Victoria.md',
        '3-Resources/Australia/Renting in Victoria.md',
      ),
      filed(
        '0-Inbox/Tax file number.md',
        '3-Resources/Australia/Tax file number.md',
      ),
      filed(
        '0-Inbox/Opening a bank account.md',
        '3-Resources/Australia/Opening a bank account.md',
      ),
    ],
    {},
    3,
  ),
  runOf(
    'demo-run-earlier-4',
    '2026-09-27T09:42:00.000Z',
    [
      filed(
        '0-Inbox/Arlington Road, 2 bed.pdf',
        '4-Archives/Flat hunt/Arlington Road, 2 bed.pdf',
        'Arlington Road, 2 bed.pdf',
      ),
      filed(
        '0-Inbox/Kentish Town flat.pdf',
        '4-Archives/Flat hunt/Kentish Town, 2 bed.pdf',
        'Kentish Town flat.pdf',
      ),
      filed(
        '0-Inbox/Camden Mews studio.pdf',
        '4-Archives/Flat hunt/Camden Mews, 1 bed.pdf',
        'Camden Mews studio.pdf',
      ),
      filed(
        '0-Inbox/IMG_4471.jpg',
        '4-Archives/Flat hunt/Arlington Road, window sign.jpg',
        'IMG_4471.jpg',
      ),
      filed(
        'Clippings/a link',
        '3-Resources/Links/Kentish Town photos.md',
        'a link',
      ),
      filed(
        '0-Inbox/Walk-through, Arlington Road.mp4',
        '4-Archives/Flat hunt/Walk-through, Arlington Road.mp4',
      ),
    ],
    {
      setAside: [
        {
          path: '4-Archives/Flat hunt/Walk-through, Arlington Road.mp4',
          reason: 'kept-not-read',
        },
      ],
      added: 'I added bike times to the flats',
    },
  ),
  runOf('demo-run-earlier-3', '2026-09-26T17:10:00.000Z', [
    filed(
      'Clippings/Weeknight curry.md',
      '3-Resources/Cooking/Weeknight curry.md',
    ),
    filed('0-Inbox/Running log.md', '3-Resources/Health/Running log.md'),
    filed(
      '0-Inbox/Sage green test patch.png',
      '4-Archives/Kitchen Refresh/Sage green test patch.png',
    ),
  ]),
  runOf('demo-run-earlier-2', '2026-09-21T08:02:00.000Z', [
    filed(
      '0-Inbox/Bills and renewals.md',
      '3-Resources/Home/Bills and renewals.md',
    ),
    filed('0-Inbox/Reading list.md', '3-Resources/Books/Reading list.md'),
    filed(
      '0-Inbox/Training plan.md',
      '4-Archives/Half Marathon/Training plan.md',
    ),
    filed(
      '0-Inbox/Half Marathon.md',
      '4-Archives/Half Marathon/Half Marathon.md',
    ),
    filed(
      '0-Inbox/Paint colours.md',
      '4-Archives/Kitchen Refresh/Paint colours.md',
    ),
    filed(
      '0-Inbox/Quotes from fitters.md',
      '4-Archives/Kitchen Refresh/Quotes from fitters.md',
    ),
    filed('0-Inbox/Sourdough.md', '3-Resources/Cooking/Sourdough.md'),
  ]),
  runOf('demo-run-earlier-1', '2026-06-12T19:45:00.000Z', [
    filed(
      '0-Inbox/Offer letter, Northwind Data.pdf',
      '4-Archives/Work/Offer letter, Northwind Data.pdf',
    ),
    filed(
      '0-Inbox/Bike shop receipt.pdf',
      '3-Resources/Money/Bike shop receipt.pdf',
    ),
  ]),
];

/** Alex's own rules under the template's text, in the shape `rules.ts`
 * reads (#342): one group with more rules than an open group shows, and a
 * few smaller ones. */
const DEMO_RULES = `${rules.replace(/\s+$/, '')}

## Money
- Receipts go to Money, named by shop and date (owner's request, 2026-09-26)
- Bank statements: one note per month with the totals (owner's request, 2026-09-27)
- Never archive Money (owner's request, 2026-09-27)
- Subscriptions go under Bills and renewals (owner's request, 2026-09-20)

## Travel
- Tickets and bookings go to the trip's project folder (owner's request, 2026-09-25)

## Everything else
- Photos of a whiteboard become a note with the text typed out (owner's request, 2026-09-22)
`;

// --- The v4 sample folder (#583) -------------------------------------------
//
// One story across the v4 design boards: Alex's flat hunt,
// the papers Bower filed in June, a garden, household costs. Every file kind
// the explorer shows is here once, plus the system files the app hides.

const KIB = 1024;
const MIB = 1024 * KIB;

/** A small picture standing in for Drive's `thumbnailLink`: hermetic (no
 * network), and fetchable like any URL. */
function thumb(label: string, fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120"><rect width="160" height="120" fill="${fill}"/><text x="80" y="66" font-family="sans-serif" font-size="14" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** A blob of `text` typed as `mimeType`: a stand-in for a binary file whose
 * Drive size is set on the fixture entry. */
function stub(text: string, mimeType: string): Blob {
  return new Blob([text], { type: mimeType });
}

/** A frontmatter value: numbers and plain dates as they are, text quoted. */
function yamlValue(value: string | number): string {
  if (typeof value === 'number') return String(value);
  return /^\d{4}-\d{2}(-\d{2})?$/.test(value) ? value : JSON.stringify(value);
}

interface CompanionSpec {
  /** Where the note lives; its name is the original's, with `.md`. */
  path: string;
  /** The original file's name, for `original: [[…]]`. */
  original: string;
  created: string;
  /** Drive's modified time, when not derived from `created`. */
  modified?: string;
  tags: string;
  kind?: string;
  /** The kind's fields, in the order written. */
  fields?: Readonly<Record<string, string | number>>;
  /** Where each field came from when not the file itself (R-AG-2). */
  origins?: Readonly<Record<string, 'notes' | 'web' | 'you'>>;
  notStated?: readonly string[];
  status?: string;
  /** Extra frontmatter after the standard fields. */
  extra?: Readonly<Record<string, string | number>>;
  /** The "Bower's note" callout's lines, origin included (R-AG-3). */
  callout: readonly string[];
  body: string;
}

/**
 * A companion note in the v4 format (spec R-AG-2, R-AG-3): frontmatter with
 * the kind's fields, `original`, `bower_origins`, `not_stated` and `status`,
 * then the `> [!bower] Bower's note` box and a short body.
 */
function companion(spec: CompanionSpec): FixtureFile {
  const lines = [
    '---',
    `tags: [${spec.tags}]`,
    `created: ${spec.created}`,
    `updated: ${spec.created}`,
  ];
  if (spec.kind !== undefined) lines.push(`kind: ${spec.kind}`);
  for (const [key, value] of Object.entries(spec.fields ?? {})) {
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push(`original: "[[${spec.original}]]"`);
  if (spec.origins !== undefined && Object.keys(spec.origins).length > 0) {
    const pairs = Object.entries(spec.origins).map(([k, v]) => `${k}: ${v}`);
    lines.push(`bower_origins: {${pairs.join(', ')}}`);
  }
  if (spec.notStated !== undefined && spec.notStated.length > 0) {
    lines.push(`not_stated: [${spec.notStated.join(', ')}]`);
  }
  if (spec.status !== undefined) lines.push(`status: ${spec.status}`);
  for (const [key, value] of Object.entries(spec.extra ?? {})) {
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push('---', '', "> [!bower] Bower's note");
  for (const line of spec.callout) lines.push(`> ${line}`);
  lines.push('', spec.body.trim(), '');
  const day = Number(spec.created.slice(8, 10));
  // Nothing is newer than the e2e clock (30 Sep, noon London), so the
  // story's files never crowd out what a test adds; the archived London
  // notes stay on their own old days (27 Sep at the latest).
  const modified =
    spec.modified ??
    (spec.created.startsWith('2026-09')
      ? at(Math.min(day, 27), '0700')
      : `${spec.created}T09:00:00.000Z`);
  return {
    path: spec.path,
    modifiedTime: modified,
    content: lines.join('\n'),
  };
}

/** The four flat listings the Compare tab lines up (boards
 * `Phone-Folder-Compare`, `Desktop-Compare`): what Bower read from each. */
interface Listing {
  name: string;
  address: string;
  type: string;
  rent: number;
  rooms: string;
  highlight: string;
  available: string;
  against: string;
  bike: string;
  fit: number;
  bikeNote?: string;
  fitNote?: string;
  status: string;
  viewing?: string;
  oldName: string;
  callout: readonly string[];
  body: string;
}

const FROM_NOTES =
  '(from your notes: [[Offer letter, Northwind Data]], [[Cycle to Work agreement]])';

export const FLAT_LISTINGS: readonly Listing[] = [
  {
    name: 'Kentish Town, 2 bed',
    address: '9 Fictional Row, London NW5',
    type: 'Flat with a garden',
    rent: 2400,
    rooms: '2 bed',
    highlight: 'garden',
    available: '2026-11-15',
    against: '+1 %',
    bike: '22 min',
    fit: 81,
    status: 'to view',
    viewing: '2026-10-03',
    oldName: 'Kentish Town flat.pdf',
    callout: [
      'Rent £2,400 a month, garden, available 15 November. (from the file)',
      `22 minutes by bike to your office. ${FROM_NOTES}`,
      'About the average for the area. (looked up)',
    ],
    body: 'The garden is the draw. It is the dearest of the four, and over the £2,300 you said you wanted to stay under.',
  },
  {
    name: 'Arlington Road, 2 bed',
    address: '14 Arlington Road, London NW1',
    type: 'Flat, second floor, no lift',
    rent: 2150,
    rooms: '2 bed',
    highlight: '2nd floor',
    available: '2026-11-01',
    against: '−10 %',
    bike: '14 min',
    bikeNote: 'from your offer letter and Cycle to Work agreement',
    fit: 72,
    fitNote: 'cheap, close, one bedroom short of a study',
    status: 'to view',
    oldName: 'Arlington Road, 2 bed.pdf',
    callout: [
      "Rent £2,150 a month, 5 weeks' deposit, available 1 November. (from the file)",
      `14 minutes by bike to your office. ${FROM_NOTES}`,
      'The listing says "newly refurbished"; the photos show the bathroom is not. (from the file) — Check',
    ],
    body: `10 % under the £2,380 average for the area (looked up). Bright, south-facing, second floor, no lift.

## Before you sign, check
- Bathroom against the "newly refurbished" claim
- Water pressure and boiler age
- Who pays the agency fee`,
  },
  {
    name: 'Camden Mews, 1 bed',
    address: '3 Fictional Mews, London NW1',
    type: 'Ground-floor flat',
    rent: 1850,
    rooms: '1 bed',
    highlight: 'ground',
    available: 'Now',
    against: '−4 %',
    bike: '18 min',
    fit: 64,
    status: 'new',
    oldName: 'Camden Mews studio.pdf',
    callout: [
      'Rent £1,850 a month, ground floor, free now. (from the file)',
      'One bedroom, and you said you want a room for a desk. (from what you told me)',
      'Cheapest of the four. (from the file)',
    ],
    body: 'Free immediately, which helps with the lease ending in December. The bedroom is small.',
  },
  {
    name: 'Holloway Road, 2 bed',
    address: '210 Holloway Road, London N7',
    type: 'Flat on a main road',
    rent: 1990,
    rooms: '2 bed',
    highlight: 'main road',
    available: '2026-12-01',
    against: '−12 %',
    bike: '27 min',
    fit: 58,
    status: 'new',
    oldName: 'Holloway Road flat.pdf',
    callout: [
      'Rent £1,990 a month, two bedrooms, available 1 December. (from the file)',
      'On a main road, and you work from home two days a week. (from what you told me) — Check',
      'Furthest from your office at 27 minutes by bike. (looked up)',
    ],
    body: 'Cheap for two bedrooms. Ask about double glazing before you book a viewing.',
  },
];

function listingFiles(): FixtureFile[] {
  const files: FixtureFile[] = [];
  for (const [i, listing] of FLAT_LISTINGS.entries()) {
    const pdf = `${listing.name}.pdf`;
    files.push({
      path: `4-Archives/Flat hunt/${pdf}`,
      mimeType: 'application/pdf',
      modifiedTime: at(27, '0700'),
      content: new Blob([LEASE_PDF], { type: 'application/pdf' }),
      size: (180 + i * 40) * KIB,
      thumbnailLink: thumb(listing.name, '#e8eef7'),
      appProperties: { bowerOrigin: 'filed' },
    });
    files.push(
      companion({
        path: `4-Archives/Flat hunt/${listing.name}.md`,
        original: pdf,
        created: '2026-09-28',
        tags: 'housing, summary',
        kind: 'rental-listing',
        fields: {
          address: listing.address,
          type: listing.type,
          rent: listing.rent,
          rooms: listing.rooms,
          highlight: listing.highlight,
          available: listing.available,
          against_area: listing.against,
          bike_to_office: listing.bike,
          fit: listing.fit,
          ...(listing.bikeNote !== undefined && {
            bike_to_office_note: listing.bikeNote,
          }),
          ...(listing.fitNote !== undefined && { fit_note: listing.fitNote }),
          ...(listing.viewing !== undefined && { viewing: listing.viewing }),
        },
        origins: {
          against_area: 'web',
          bike_to_office: 'notes',
          fit: 'you',
        },
        notStated: ['pets', 'bills_included', 'agency_fee'],
        status: listing.status,
        extra: { pages: 2 },
        callout: listing.callout,
        body: listing.body,
      }),
    );
  }
  return files;
}

/** The budget Alex copied from a Google Sheet: 24 months, one row each. */
function budgetCsv(): string {
  const months = [
    'Nov',
    'Dec',
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
  ];
  const bills = [210, 240, 260, 250, 220, 190, 170, 160, 160, 170, 190, 200];
  const rows = ['Month,Rent,Bills,Total'];
  for (let i = 0; i < 24; i++) {
    const bill = bills[i % 12] ?? 0;
    rows.push(`${months[i % 12] ?? ''},2150,${bill},${2150 + bill}`);
  }
  return `${rows.join('\n')}\n`;
}

/** The rows of the Flat budget the fixture writes, for tests. */
export const FLAT_BUDGET_ROWS = 24;

const V4_FILES: readonly FixtureFile[] = [
  // --- Flat hunt: listings, photo, lease, budget, video, ZIP ----------------
  ...listingFiles(),
  companion({
    path: '4-Archives/Flat hunt/Arlington Road, window sign.md',
    original: 'Arlington Road, window sign.jpg',
    created: '2026-09-27',
    tags: 'housing',
    callout: [
      'The sign gives the agent\'s number and "viewings Saturdays 10 to 12". (from the file)',
    ],
    body: 'A photo of the "To let" sign outside 14 Arlington Road, taken on the way to the viewing.',
  }),
  companion({
    path: '4-Archives/Flat hunt/Lease agreement 2026.md',
    original: 'Lease agreement 2026.pdf',
    created: '2026-09-27',
    tags: 'housing, summary',
    kind: 'contract',
    fields: {
      with: 'Fictional Lettings Ltd',
      covers: 'the flat',
      payments: 'monthly',
      starts: '2026-11-01',
      notice: 'two months, after six',
    },
    notStated: ['value', 'ends'],
    extra: { pages: 42 },
    callout: [
      'Twelve months from 1 November, then month to month. (from the file)',
      "Break clause after six months, two months' notice. (from the file)",
    ],
    body: `A long tenancy agreement.

## Where to look
- [[Lease agreement 2026.pdf#page=4|p. 4]]: Rent, deposit and when it is paid
- [[Lease agreement 2026.pdf#page=12|p. 12]]: The break clause
- [[Lease agreement 2026.pdf#page=19|p. 19]]: Pets: none without written consent
- [[Lease agreement 2026.pdf#page=31|p. 31]]: Who repairs what`,
  }),
  {
    // A copy of a Google Sheet: Bower keeps the first sheet as a table.
    path: '4-Archives/Flat hunt/Flat budget.csv',
    mimeType: 'text/csv',
    modifiedTime: at(26, '1815'),
    content: budgetCsv(),
    size: 3 * KIB,
    appProperties: { bowerSource: 'Flat budget', bowerSourceKind: 'sheet' },
  },
  {
    path: '4-Archives/Flat hunt/Walk-through, Arlington Road.mp4',
    mimeType: 'video/mp4',
    modifiedTime: at(26, '1120'),
    content: stub('video', 'video/mp4'),
    size: 86 * MIB,
    thumbnailLink: thumb('Walk-through', '#dfe7e0'),
    videoMediaMetadata: { durationMillis: 134_000 },
    preview: true,
  },
  {
    path: '4-Archives/Flat hunt/Photos from the viewing.zip',
    mimeType: 'application/zip',
    modifiedTime: at(26, '1130'),
    content: stub('zip', 'application/zip'),
    size: 38 * MIB,
  },

  // --- Work: the papers Bower filed in June and July -----------------------
  {
    path: '4-Archives/Work/Offer letter, Northwind Data.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2026-06-12T19:45:00.000Z',
    content: new Blob([INVOICE_PDF], { type: 'application/pdf' }),
    size: 240 * KIB,
    thumbnailLink: thumb('Offer letter', '#f3ece0'),
    appProperties: { bowerOrigin: 'filed' },
  },
  companion({
    path: '4-Archives/Work/Offer letter, Northwind Data.md',
    original: 'Offer letter, Northwind Data.pdf',
    created: '2026-06-12',
    tags: 'work, summary',
    kind: 'job-offer',
    fields: {
      role: 'Data engineer',
      employer: 'Northwind Data',
      office: "King's Cross",
      salary: 78000,
      starts: '2026-08-01',
    },
    status: 'applied',
    extra: { pages: 3 },
    callout: [
      'Data engineer, £78,000 a year, starting 1 August. (from the file)',
      "The office is at King's Cross. (from the file)",
    ],
    body: 'The offer you accepted in June. Original: PDF, 3 pages.',
  }),
  {
    path: '4-Archives/Work/Cycle to Work agreement.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2026-07-08T18:20:00.000Z',
    content: new Blob([INVOICE_PDF], { type: 'application/pdf' }),
    size: 310 * KIB,
    thumbnailLink: thumb('Cycle to Work', '#f3ece0'),
    appProperties: { bowerOrigin: 'filed' },
  },
  companion({
    path: '4-Archives/Work/Cycle to Work agreement.md',
    original: 'Cycle to Work agreement.pdf',
    created: '2026-07-08',
    tags: 'work, summary',
    kind: 'contract',
    fields: {
      with: 'Northwind Data',
      covers: 'bike',
      value: 1200,
      payments: 'from your salary, monthly',
      starts: '2026-07',
      ends: '2027-07',
    },
    callout: [
      'A £1,200 bike, paid back from your salary until July 2027. (from the file)',
    ],
    body: 'Also filed in July. Keep it: the scheme asks for it if you leave early.',
  }),
  {
    path: '4-Archives/Work/Job offer, Northwind Data.md',
    modifiedTime: at(26, '1005'),
    content: `---
tags: [work, summary]
created: 2026-09-26
updated: 2026-09-26
kind: job-offer
role: Senior data engineer
employer: Northwind Data
office: King's Cross
salary: 78000
reply_by: 2026-10-10
apply_link: https://example.com/careers/senior-data-engineer
score: 82
verdict: Apply first
status: new
---

> [!bower] Bower's note
> Senior data engineer, £78,000, hybrid three days in the office. (from the file)
> That is £6,000 above your floor; the commute is 40 minutes. (from your notes: [[About-Me]])
> Reply by 10 October. (from the file) — Check

# Job offer, Northwind Data

A second offer from the same company, for a senior role. The full letter is long; the sections below keep its order.

## Pay and benefits

> [!bower]- Bower on this section
> £78,000 base, a 10 % bonus and 28 days of holiday. (from the file)
> The bonus is paid in March, after the year end. (from the file)

Base salary of £78,000 a year, paid monthly. A discretionary bonus of up to 10 % is paid in March. Twenty-eight days of holiday plus bank holidays, rising by one day a year to a maximum of thirty-three.

## Notice and non-compete

> [!bower]- Bower on this section
> Twelve months' non-compete in the same sector: longer than the usual six. (from the file) — Check

Notice is three months on both sides after the probation period. Clause 9.2 restricts working for a competitor in the same sector for twelve months after leaving.

## The team

Six engineers and a product manager, working from the King's Cross office on Tuesdays, Wednesdays and Thursdays.

## Questions to ask

- Can the non-compete be shortened to six months?
- Is the hybrid pattern written into the contract or a policy?
- Does the bonus depend on company results or personal ones?
`,
  },
  // What Bower made for that offer (R-VERDICT, Compare's Made for it).
  {
    path: '4-Archives/Work/CV · Northwind Data.md',
    modifiedTime: at(26, '1015'),
    content: `---
tags: [work, cv]
created: 2026-09-26
updated: 2026-09-26
made_for: "[[Job offer, Northwind Data]]"
---

# CV · Northwind Data

Data engineer with six years of pipeline work. Leads with the warehouse migration and the cost cut, then the team you ran.
`,
  },
  {
    path: '4-Archives/Work/Letter · Northwind Data.md',
    modifiedTime: at(26, '1020'),
    content: `---
tags: [work, letter]
created: 2026-09-26
updated: 2026-09-26
made_for: "[[Job offer, Northwind Data]]"
---

# Letter · Northwind Data

Dear hiring team, I am applying for the senior data engineer role. The three-day hybrid pattern suits how I work best.
`,
  },

  // The runner's counts for files Drive has no metadata for (#610, #674):
  // sheets, ZIP entries and the lease's pages (`file-facts.ts`).
  {
    path: '.bower/file-facts.json',
    mimeType: 'application/json',
    modifiedTime: at(27, '0700'),
    content: JSON.stringify({
      '3-Resources/Money/Household costs 2026.xlsx': { sheets: 3 },
      '4-Archives/Flat hunt/Photos from the viewing.zip': { entries: 14 },
      '4-Archives/Flat hunt/Lease agreement 2026.pdf': { pages: 42 },
    }),
  },

  // --- Money, Garden, Home ---------------------------------------------------
  {
    path: '3-Resources/Money/Household costs 2026.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    modifiedTime: at(24, '2010'),
    content: stub(
      'xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
    size: 18 * KIB,
    thumbnailLink: thumb('Household costs', '#e3f0e6'),
    preview: true,
  },
  {
    path: '3-Resources/Money/Bike shop receipt.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2026-06-12T19:45:00.000Z',
    content: new Blob([INVOICE_PDF], { type: 'application/pdf' }),
    size: 96 * KIB,
    thumbnailLink: thumb('Receipt', '#f3ece0'),
    appProperties: { bowerOrigin: 'filed' },
  },
  {
    path: '3-Resources/Garden/Tomato seedlings.jpg',
    mimeType: 'image/jpeg',
    modifiedTime: at(27, '0738'),
    content: pngBlob(TEST_PATCH_PNG),
    size: 1_800_000,
    thumbnailLink: thumb('Tomato seedlings', '#dcefd0'),
    imageMediaMetadata: {
      time: '2026:09:27 07:31:12',
      width: 4032,
      height: 3024,
    },
  },
  {
    // An iPhone photo: a format the app shows only by name (System-Formats).
    path: '3-Resources/Garden/Front bed.heic',
    mimeType: 'image/heic',
    modifiedTime: at(25, '1650'),
    content: stub('heic', 'image/heic'),
    size: 2 * MIB,
    imageMediaMetadata: {
      time: '2026:09:25 16:48:03',
      width: 4032,
      height: 3024,
    },
  },

  // --- Resources and Answers -------------------------------------------------
  note(
    '3-Resources/Links/Kentish Town photos.md',
    27,
    'link',
    `# Kentish Town photos

A link to the listing's photo gallery: rightmove.example.com/properties/kentish-town

Saved from the flat hunt. Part of [[Flat hunt]].`,
    'source: https://rightmove.example.com/properties/kentish-town\n',
  ),
  note(
    '3-Resources/Viewing checklist.md',
    27,
    'guide, housing',
    `# Viewing checklist

- Damp by the windows and in the bathroom
- Water pressure: run the shower and a tap together
- Boiler age and the last service date
- Who pays the agency fee, and what is in the bills
- Whether pets are allowed, in writing

Made for [[Flat hunt]].`,
  ),
  {
    path: 'Answers/Which flat should we view first.md',
    modifiedTime: at(27, '0705'),
    content: `---
type: answer
tags: [answer, housing]
created: 2026-09-28
updated: 2026-09-28
question: Which two should we view first?
---

> [!bower] Bower's note
> Arlington Road first: the cheapest 2-bed, 14 minutes by bike to your office. (from the file)
> Kentish Town second: a garden and 2 beds, but £2,400 and 22 minutes. (from the file)
> Camden Mews has one bedroom; Holloway Road is on a main road. (from what you told me) — Check

# Which flat should we view first?

## At the viewing, check
- Arlington: the bathroom against "newly refurbished"
- Both: damp by the windows, water pressure

## Ask the agent
- Can the start move to 15 November?
- Pets, bills, the agency fee: not in either listing

More in [[Viewing checklist]].

Used: the four listings, your offer letter and Cycle to Work agreement, routes and area prices from the web.
`,
  },

  // --- A text copy of a document of no listed kind (R-NOTE-8, D21) ----------
  {
    path: '4-Archives/Work/CV 2026.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    modifiedTime: at(25, '0900'),
    content: stub('CV 2026', 'application/octet-stream'),
    size: 48 * KIB,
    appProperties: { bowerOrigin: 'filed' },
  },
  {
    path: '4-Archives/Work/CV 2026.md',
    modifiedTime: at(25, '0905'),
    content: `---
by: bower
tags: [work]
created: 2026-09-25
updated: 2026-09-25
original: "[[CV 2026.docx]]"
facts:
  Role: Data engineer
  Years: 6
---

> [!bower] Bower's note
> Alex's CV: six years in data engineering, the last three at one company. (from the file)

## The document

# Alex, data engineer

### Professional summary

Data engineer with six years of experience building reporting pipelines.

### Experience

Three years at Fictional Retail Ltd, before that two at a small analytics firm.

### Skills

SQL, Python, dbt.
`,
  },

  // --- Written by Alex -------------------------------------------------------
  // (`Notes from the viewing.md` is in the Projects block above.)

  // --- System files: never shown (D18) --------------------------------------
  {
    path: '4-Archives/Flat hunt/desktop.ini',
    mimeType: 'text/plain',
    modifiedTime: at(26, '1000'),
    content: '[.ShellClassInfo]\n',
  },
  {
    path: '4-Archives/Work/desktop.ini',
    mimeType: 'text/plain',
    modifiedTime: at(26, '1000'),
    content: '[.ShellClassInfo]\n',
  },
  {
    path: '3-Resources/Garden/desktop.ini',
    mimeType: 'text/plain',
    modifiedTime: at(26, '1000'),
    content: '[.ShellClassInfo]\n',
  },
  {
    path: '4-Archives/Flat hunt/~$Lease agreement 2026.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    modifiedTime: at(27, '0930'),
    content: stub('lock', 'application/octet-stream'),
    size: 162,
  },
];

// --- The v6 world (#903): Melbourne ----------------------------------------
//
// What the v6 boards draw (PF-*, LI-*, AR-*, HM-*, JF-*, NO-*, FI-*), with
// the stand-ins of spec §0 for anything personal: Alex, "Cover Letter -
// Alex", "Passport copy", "CV Australia". The flats, offers and companies
// are the boards' own fictional ones; the CV and visa facts are invented.

/** A note with its own frontmatter lines, modified at `modified`. */
function noteAt(
  path: string,
  modified: string,
  frontmatter: readonly string[],
  body: string,
): FixtureFile {
  return {
    path,
    modifiedTime: modified,
    content: `---\n${frontmatter.join('\n')}\n---\n\n${body.trim()}\n`,
  };
}

/** A PDF stub of `size` bytes as Drive reports it, filed by Bower. */
function pdfAt(
  path: string,
  modified: string,
  size: number,
  label: string,
  filedByBower = true,
): FixtureFile {
  return {
    path,
    mimeType: 'application/pdf',
    modifiedTime: modified,
    content: new Blob([LEASE_PDF], { type: 'application/pdf' }),
    size,
    thumbnailLink: thumb(label, '#e8eef7'),
    ...(filedByBower && { appProperties: { bowerOrigin: 'filed' } }),
  };
}

/**
 * The per-folder status lists (E-7 as ruled, #916 reads them, #921 makes
 * the real agent write them): Bower picks the list for each comparable
 * folder and writes it into the folder's hub note; the kind's own list is
 * the fallback.
 */
export const FOLDER_STATUSES: Readonly<Record<string, readonly string[]>> = {
  [MOONEE_PONDS]: [
    'new',
    'to view',
    'viewed',
    'applied',
    'approved',
    'signed',
    'not for me',
    'turned down',
  ],
  [APPLICATIONS]: [
    'new',
    'applied',
    'interview',
    'offer',
    'accepted',
    'not for me',
    'turned down',
  ],
};

/** `statuses: [...]`, the hub note's frontmatter line for `folder`. */
function statusesLine(folder: string): string {
  return `statuses: [${(FOLDER_STATUSES[folder] ?? []).join(', ')}]`;
}

/** The six Moonee Ponds flats Compare lines up (board PF-Compare-1280). */
interface Flat {
  name: string;
  rent: string;
  /** `YYYY-MM-DD`, or absent: "No date yet". */
  available?: string;
  against: string;
  fit: number;
  status: string;
  viewing?: string;
  /** London time today, `hhmm`. */
  time: string;
  callout: readonly string[];
  body: string;
}

export const MOONEE_PONDS_FLATS: readonly Flat[] = [
  {
    name: '10-43 Buckley St, Moonee Ponds',
    rent: '460 AUD/week',
    available: '2026-10-07',
    against: '−15% vs area median',
    fit: 73,
    status: 'to view',
    viewing: '2026-10-01',
    time: '0654',
    callout: [
      'AUD 460/week, 15% under the suburb median, with internal laundry, a balcony and A/C. (from the file)',
      'Available 7 Oct, a week before your short let ends. (from your notes: [[Housing Search Australia]])',
      '~10–15 min walk to Essendon or Moonee Ponds station; the Wed 1 Oct inspection is still open. (looked up)',
    ],
    body: 'The most complete of the six Moonee Ponds 1-beds: internal laundry, balcony and A/C are rare together at this price.',
  },
  {
    name: '6-20 Mantell St, Moonee Ponds',
    rent: '350 AUD/week',
    against: '−35% vs area median',
    fit: 72,
    status: 'to view',
    time: '0652',
    callout: [
      'AUD 350/week, the cheapest of the six. (from the file)',
      'No move-in date in the listing. (from the file) — Check',
    ],
    body: 'A small ground-floor unit; ask the agent when it is free.',
  },
  {
    name: '9-2 Alexandra Ave, Moonee Ponds',
    rent: '495 AUD/week',
    against: '−8% vs area median',
    fit: 72,
    status: 'new',
    time: '0650',
    callout: [
      'AUD 495/week, the dearest of the six, with a car space. (from the file)',
    ],
    body: 'Close to the station and the shops on Puckle St.',
  },
  {
    name: '21-51 Buckley St, Moonee Ponds',
    rent: '395 AUD/week',
    available: '2026-09-25',
    against: '−27% vs area median',
    fit: 66,
    status: 'new',
    time: '0648',
    callout: ['AUD 395/week, free since 25 Sep. (from the file)'],
    body: 'On the busy end of Buckley St; the bedroom faces the road.',
  },
  {
    name: '8-128 Park St, Moonee Ponds',
    rent: '450 AUD/week',
    against: '−17% vs area median',
    fit: 60,
    status: 'new',
    time: '0646',
    callout: ['AUD 450/week, no laundry in the unit. (from the file)'],
    body: 'A shared laundry downstairs; no date yet.',
  },
  {
    name: '10-8 Eddy St, Moonee Ponds',
    rent: '460 AUD/week',
    available: '2026-09-29',
    against: '−15% vs area median',
    fit: 58,
    status: 'new',
    time: '0644',
    callout: ['AUD 460/week, free since 29 Sep. (from the file)'],
    body: 'A second-floor walk-up with no lift and no A/C.',
  },
];

function mooneePondsFiles(): FixtureFile[] {
  const files: FixtureFile[] = [];
  for (const [i, flat] of MOONEE_PONDS_FLATS.entries()) {
    const pdf = `${flat.name}.pdf`;
    // The listing as saved from the agent's site: one of Alex's originals.
    files.push(
      pdfAt(
        `${LISTINGS}/${pdf}`,
        today(`063${i}`),
        (150 + i * 20) * KIB,
        flat.name,
        false,
      ),
    );
    files.push(
      companion({
        path: `${MOONEE_PONDS}/${flat.name}.md`,
        original: pdf,
        created: '2026-09-30',
        modified: today(flat.time),
        tags: 'housing, summary',
        kind: 'rental-listing',
        fields: {
          address: flat.name,
          type: 'Apartment',
          rent: flat.rent,
          rooms: '1 bed',
          ...(flat.available !== undefined && { available: flat.available }),
          against_area: flat.against,
          fit: flat.fit,
          ...(flat.viewing !== undefined && { viewing: flat.viewing }),
        },
        origins: { against_area: 'web', fit: 'you' },
        notStated:
          flat.available === undefined
            ? ['available', 'pets', 'bond']
            : ['pets', 'bond'],
        status: flat.status,
        callout: flat.callout,
        body: flat.body,
      }),
    );
  }
  return files;
}

/** The four job offers Compare lines up (boards LI-Main, LI-Compare). */
interface Offer {
  name: string;
  role: string;
  employer: string;
  office: string;
  salary?: string;
  fit: number;
  status: string;
  modified: string;
  callout: readonly string[];
  body: string;
}

export const JOB_OFFERS: readonly Offer[] = [
  {
    name: 'Senior Consultant - Data Engineer, Altis Consulting',
    role: 'Senior Consultant - Data Engineer',
    employer: 'Altis Consulting',
    office: 'Melbourne, VIC',
    fit: 79,
    // The old value, drawn on LI-Compare-375 ("Declined"): not in the
    // folder's list, so the status menu shows it as an extra option (#916).
    status: 'declined',
    modified: today('0711'),
    callout: [
      "A more hands-on, less leadership-heavy role than Altis's other listing; lists Google Cloud as a preferred platform. (from the file)",
      'Closest technical match of the four: SQL, data modelling, ETL/ELT and GCP line up with your day-to-day work. (from your notes: [[CV insights]])',
      'Scored 79/100, above the 70-point bar in your CV rule; a tailored [[CV - Senior Consultant, Altis Consulting|CV]] and [[Cover Letter - Senior Consultant, Altis Consulting|cover letter]] are ready.',
    ],
    body: 'Hybrid, Melbourne CBD. The listing gives no salary.',
  },
  {
    name: 'Lead Data Engineer, Clicks IT Recruitment',
    role: 'Lead Data Engineer',
    employer: 'Clicks IT Recruitment',
    office: 'Melbourne, VIC',
    salary: '$140,000 – $155,000 AUD + super',
    fit: 61,
    status: 'applied',
    modified: yesterday('1355'),
    callout: [
      'A recruiter listing for an unnamed client in financial services. (from the file)',
    ],
    body: 'Applied through the recruiter on 29 Sep.',
  },
  {
    name: 'Senior Data Engineer Team Lead, Allume Energy',
    role: 'Senior Data Engineer Team Lead',
    employer: 'Allume Energy',
    office: 'Abbotsford, Melbourne VIC',
    salary: '$150,000 – $165,000 AUD base + super',
    fit: 73,
    status: 'new',
    modified: yesterday('1353'),
    callout: [
      'Leads a team of four; the only offer of the four with a salary range. (from the file)',
    ],
    body: 'Hybrid, three days in the Abbotsford office.',
  },
  {
    name: 'Managing Consultant, Altis Consulting',
    role: 'Managing Consultant',
    employer: 'Altis Consulting',
    office: 'Melbourne, VIC',
    fit: 65,
    status: 'new',
    modified: yesterday('1352'),
    callout: [
      'More client management than engineering. (from the file) — Check',
    ],
    body: 'Hybrid, Melbourne CBD. The listing gives no salary.',
  },
];

function applicationFiles(): FixtureFile[] {
  const offers = JOB_OFFERS.map((offer) =>
    noteAt(
      `${APPLICATIONS}/${offer.name}.md`,
      offer.modified,
      [
        'tags: [career, summary]',
        'created: 2026-09-29',
        `updated: ${offer.modified.slice(0, 10)}`,
        'kind: job-offer',
        `role: ${yamlValue(offer.role)}`,
        `employer: ${yamlValue(offer.employer)}`,
        `office: ${yamlValue(offer.office)}`,
        'hours: Hybrid',
        ...(offer.salary === undefined
          ? ['not_stated: [salary]']
          : [`salary: ${yamlValue(offer.salary)}`]),
        `fit: ${offer.fit}`,
        `status: ${offer.status}`,
      ],
      `> [!bower] Bower's note\n${offer.callout.map((line) => `> ${line}`).join('\n')}\n\n${offer.body}`,
    ),
  );
  /** A CV or cover letter Bower wrote for one offer. */
  const madeFor = (
    name: string,
    offer: string,
    modified: string,
    answer: boolean,
    body: string,
  ): FixtureFile =>
    noteAt(
      `${APPLICATIONS}/${name}.md`,
      modified,
      [
        'by: bower',
        ...(answer ? ['type: answer'] : []),
        'tags: [career]',
        'created: 2026-09-29',
        'updated: 2026-09-29',
        `made_for: "[[${offer}]]"`,
      ],
      `# ${name}\n\n${body}`,
    );
  return [
    noteAt(
      `${APPLICATIONS}/Applications.md`,
      yesterday('1350'),
      [
        'tags: [project, hub, career]',
        'created: 2026-09-29',
        'updated: 2026-09-29',
        'status: active',
        statusesLine(APPLICATIONS),
      ],
      '# Applications\n\nThe roles Alex is applying for, one note each, with the CVs and letters Bower tailored.',
    ),
    ...offers,
    noteAt(
      `${APPLICATIONS}/Job ratings.md`,
      yesterday('1354'),
      [
        'type: answer',
        'tags: [answer, career]',
        'created: 2026-09-29',
        'updated: 2026-09-29',
        'question: Rate the job offers against my CV',
      ],
      `> [!bower] Bower's note
> Altis, Senior Consultant first: 79/100. (from your notes: [[CV insights]])
> Allume second: 73/100, the only one with a salary range. (from the file)

# Job ratings

| Offer | Fit |
| --- | --- |
| Senior Consultant - Data Engineer, Altis Consulting | 79 |
| Senior Data Engineer Team Lead, Allume Energy | 73 |
| Managing Consultant, Altis Consulting | 65 |
| Lead Data Engineer, Clicks IT Recruitment | 61 |`,
    ),
    madeFor(
      'Cover Letter - Senior Data Engineer Team Lead, Allume Energy',
      'Senior Data Engineer Team Lead, Allume Energy',
      yesterday('1351'),
      true,
      'Dear Allume team, I am applying for the Senior Data Engineer Team Lead role.',
    ),
    madeFor(
      'CV - Senior Data Engineer Team Lead, Allume Energy',
      'Senior Data Engineer Team Lead, Allume Energy',
      yesterday('1301'),
      false,
      'Leads with the team Alex ran and the pipeline cost cut.',
    ),
    madeFor(
      'Cover Letter - Senior Consultant, Altis Consulting',
      'Senior Consultant - Data Engineer, Altis Consulting',
      yesterday('1300'),
      false,
      'Dear Altis team, I am applying for the Senior Consultant - Data Engineer role.',
    ),
    madeFor(
      'CV - Senior Consultant, Altis Consulting',
      'Senior Consultant - Data Engineer, Altis Consulting',
      yesterday('1259'),
      false,
      'Leads with SQL, data modelling and the move to Google Cloud.',
    ),
  ];
}

const V6_WORLD: readonly FixtureFile[] = [
  // --- Housing Search Australia (boards PF-*, HM-Main) ----------------------
  // Pinned to Home: "Housing Search Australia · Projects · 14 things".
  noteAt(
    `${HOUSING}/Housing Search Australia.md`,
    yesterday('1140'),
    [
      'tags: [project, hub, housing]',
      'created: 2026-09-29',
      'updated: 2026-09-29',
      'status: active',
      'pinned: 2026-09-29T10:45:00.000Z',
    ],
    `# Housing Search Australia

A one-bedroom flat in Melbourne's inner north before the short let ends mid-October.

- [[Moonee Ponds]]: the six listings Bower read`,
  ),
  noteAt(
    `${MOONEE_PONDS}/Moonee Ponds.md`,
    yesterday('1145'),
    [
      'tags: [project, hub, housing]',
      'created: 2026-09-29',
      'updated: 2026-09-29',
      'status: active',
      statusesLine(MOONEE_PONDS),
    ],
    `# Moonee Ponds

Six one-bedroom listings, each with a note from Bower. Under 500 AUD a week, close to a train line.`,
  ),
  ...mooneePondsFiles(),

  // --- Job Search Australia (boards NO-Main, FI-Main, LI-*) -----------------
  // Tree order (FI-Bottom "2 of 6", NO-Bottom "3 of 6"): the hub note,
  // Cover Letter - Alex, CV insights, LinkedIn profile, CV Australia, SEEK
  // profile: newest first after the hub.
  noteAt(
    `${JOBS}/Job Search Australia.md`,
    yesterday('1225'),
    [
      'tags: [project, hub, career]',
      'created: 2026-09-29',
      'updated: 2026-09-29',
      'status: active',
    ],
    `# Job Search Australia

A senior data engineering role in Melbourne, hybrid.

- [[Applications]]
- [[CV insights]]`,
  ),
  pdfAt(
    `${JOBS}/Cover Letter - Alex.pdf`,
    yesterday('1301'),
    117 * KIB,
    'Cover letter',
  ),
  companion({
    path: `${JOBS}/CV insights.md`,
    original: 'CV Australia.docx',
    created: '2026-09-29',
    modified: yesterday('1300'),
    tags: 'summary, career',
    callout: [
      'Eight years as a data engineer (SQL, Python, dbt, Google Cloud), most recently at Northwind Data in London. (from the file)',
      'Work rights need a clear callout: a Working Holiday visa now, a skilled visa applied for. (from your notes: [[Visa & Immigration]])',
      'The LinkedIn link on the CV matches your [[LinkedIn profile]] note. — Check',
    ],
    body: `## Why
A summary of [[CV Australia]], the CV tailored for [[Job Search Australia]], with the facts an Australian recruiter would look for first and what is worth checking before it goes out.

## Key facts
- Target role: Senior Data Engineer (Google Cloud)
- Experience: 8 years, retail and financial data
- Current role: Data Engineer, Northwind Data, London (2026)
- Work rights: Working Holiday visa; skilled visa applied for

## What this means for you
Lead with the Google Cloud work; say the visa status in the first lines.

## Next steps
- Add the visa line to the CV's header
- Ask two referees in Melbourne`,
  }),
  noteAt(
    `${JOBS}/LinkedIn profile.md`,
    yesterday('1223'),
    ['tags: [career]', 'created: 2026-09-29', 'updated: 2026-09-29'],
    `# LinkedIn profile

Headline: Senior Data Engineer · Google Cloud · Melbourne. Open to work, hybrid.`,
  ),
  {
    path: `${JOBS}/CV Australia.docx`,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    modifiedTime: yesterday('1214'),
    content: stub('CV Australia', 'application/octet-stream'),
    size: 52 * KIB,
    appProperties: { bowerOrigin: 'filed' },
    preview: true,
  },
  noteAt(
    `${JOBS}/SEEK profile.md`,
    yesterday('1210'),
    ['tags: [career]', 'created: 2026-09-29', 'updated: 2026-09-29'],
    `# SEEK profile

Visible to employers. Right to work: Working Holiday visa. Salary expectation: from 140,000 AUD + super.`,
  ),
  ...applicationFiles(),

  // --- Areas › Visa & Immigration (boards AR-Main, AR-Sub) ------------------
  noteAt(
    `${VISA}/Visa & Immigration.md`,
    yesterday('1502'),
    [
      'tags: [area, visa]',
      'created: 2026-09-29',
      'updated: 2026-09-29',
      'status: active',
    ],
    `# Visa & Immigration

- Current visa: Working Holiday, valid until June 2027.
- Skilled visa: applied for on 12 September; waiting for the health check.
- Keep a copy of the passport with the application.`,
  ),
  // Filed by yesterday's last tidy-up, so it is new since the last look.
  pdfAt(`${VISA}/Passport copy.pdf`, yesterday('1503'), 356 * KIB, 'Passport'),

  // --- The two requests yesterday's tidy-ups answered ------------------------
  noteAt(
    '0-Inbox/Processed/Bower - 2026-09-29 1228 Rate the job offers against my CV.md',
    yesterday('1228'),
    ['tags: [instruction]', 'date: 2026-09-29T11:28:00.000Z', 'via: app'],
    'Rate the job offers against my CV.',
  ),
  noteAt(
    '0-Inbox/Processed/Bower - 2026-09-29 1209 Keep my visa papers together.md',
    yesterday('1209'),
    ['tags: [instruction]', 'date: 2026-09-29T11:09:00.000Z', 'via: app'],
    'Keep my visa papers together.',
  ),

  // --- Resources › Australia (filed by yesterday's first tidy-up) -----------
  noteAt(
    '3-Resources/Australia/Renting in Victoria.md',
    yesterday('1146'),
    ['tags: [guide, housing]', 'created: 2026-09-29', 'updated: 2026-09-29'],
    '# Renting in Victoria\n\nThe bond is at most four weeks of rent and is lodged with the state bond authority, not the agent.',
  ),
  noteAt(
    '3-Resources/Australia/Tax file number.md',
    yesterday('1145'),
    ['tags: [guide, money]', 'created: 2026-09-29', 'updated: 2026-09-29'],
    '# Tax file number\n\nApply online once in the country; employers ask for it on the first day.',
  ),
  noteAt(
    '3-Resources/Australia/Opening a bank account.md',
    yesterday('1144'),
    ['tags: [guide, money]', 'created: 2026-09-29', 'updated: 2026-09-29'],
    '# Opening a bank account\n\nBring the passport and a proof of address; the short let agreement counts.',
  ),
];

/** Folders that exist with nothing in them: the empty-folder screen's
 * target (board `Phone-Folder-Empty`). */
export const FIXTURE_FOLDERS: readonly string[] = ['3-Resources/Car'];

export const FIXTURE_FILES: readonly FixtureFile[] = [
  // --- Top of the folder -------------------------------------------------
  { path: 'CLAUDE.md', content: rulebook, modifiedTime: at(1) },
  { path: 'Rules.md', content: DEMO_RULES, modifiedTime: at(1) },
  { path: 'About-Me.md', content: aboutMe, modifiedTime: at(1) },
  note(
    'index.md',
    26,
    'meta, hub',
    `# Index

## Projects
- [[Housing Search Australia]]: a one-bedroom in Moonee Ponds
- [[Job Search Australia]]: a data engineering role in Melbourne

## Areas
- [[Visa & Immigration]]

## Resources
- [[Home]], [[Health]], [[Money]], [[Garden]]
- [[Shopping list]] · under Home
- [[Cooking]], [[Reading list]], [[Packing light]]
- [[Renting in Victoria]], [[Tax file number]], [[Opening a bank account]]

## Archives
- [[Lisbon Trip]]: a week in Lisbon last October
- [[Kitchen Refresh]]: paint, shelves and a new tap
- [[4-Archives/Kitchen Refresh/Sage green test patch.png]] · Photo · filed by Bower
- [[Half Marathon]]: race day in November
- [[Flat hunt]]: the London flat hunt, before the move
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
- 2026-09-26 08:10 · Filed: Running log.md → 3-Resources/Health
- 2026-09-26 08:11 · Filed: Weeknight curry.md → 3-Resources/Cooking
- 2026-09-27 06:49 · Filed: Lease agreement 2026.pdf → 4-Archives/Flat hunt
- 2026-09-27 06:50 · Filed: Arlington Road, window sign.jpg → 4-Archives/Flat hunt, renamed from IMG_4471.jpg
- 2026-09-27 06:51 · Filed: Notes from the viewing.md → 4-Archives/Flat hunt`,
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
    content: `---\ntags: [instruction]\ndate: 2026-09-27T08:15:00.000Z\nvia: app\n---\n\nWhat do I still need to sort out for the visa?\n`,
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
    '4-Archives/Lisbon Trip/Lisbon Trip.md',
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
    'status: active\n',
  ),
  note(
    '4-Archives/Lisbon Trip/Flights and stays.md',
    12,
    'document, travel',
    `# Flights and stays

- Out: 14 Oct, 07:10, seat 14C. Back: 21 Oct, 19:45.
- Flat in Alfama, check-in from 15:00, host sends the door code the day before.

Part of [[Lisbon Trip]].`,
  ),
  note(
    '4-Archives/Lisbon Trip/Things to see in Lisbon.md',
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
    '4-Archives/Lisbon Trip/Packing list.md',
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
    '4-Archives/Kitchen Refresh/Kitchen Refresh.md',
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
    '4-Archives/Kitchen Refresh/Paint colours.md',
    18,
    'note, home',
    `# Paint colours

Shortlist: a warm white for the walls, sage green for the cupboard doors. Test pots bought; decide after a week of looking at them in daylight.

Part of [[Kitchen Refresh]].`,
  ),
  note(
    '4-Archives/Kitchen Refresh/Quotes from fitters.md',
    18,
    'document, home, finance',
    `# Quotes from fitters

| Fitter | Shelves and tap | Available |
| --- | --- | --- |
| First quote | 420 | Mid October |
| Second quote | 365 | November |

The second one is cheaper but after the trip. Part of [[Kitchen Refresh]].`,
  ),
  // Who filed these two is known two ways (`file-origin.ts`): the PDF
  // carries it as a Drive app property, the photo has a row in `index.md`.
  {
    path: '4-Archives/Kitchen Refresh/Shelves and tap quote.pdf',
    mimeType: 'application/pdf',
    modifiedTime: at(25, '1730'),
    content: new Blob([FITTER_QUOTE_PDF], { type: 'application/pdf' }),
    appProperties: { bowerOrigin: 'filed' },
  },
  {
    path: '4-Archives/Kitchen Refresh/Sage green test patch.png',
    mimeType: 'image/png',
    modifiedTime: at(26, '1015'),
    content: pngBlob(TEST_PATCH_PNG),
  },
  note(
    '4-Archives/Half Marathon/Half Marathon.md',
    20,
    'project, hub, health',
    `# Half Marathon

Race day: 16 November. Target: finish under two hours, enjoy it.

- [[Training plan]]
- [[Running log]]`,
    'status: active\n',
  ),
  note(
    '4-Archives/Half Marathon/Training plan.md',
    20,
    'guide, health',
    `# Training plan

- Tuesday: 5 km easy
- Thursday: intervals, 6 × 800 m
- Sunday: long run, adding 1 km a week up to 18 km

Taper the last ten days. Log every run in [[Running log]].`,
  ),
  // A fourth project (#367, `Demo-Home`/`Demo-Add`/`Demo-Working`/
  // `Demo-Tidy-Confirm` boards): the PDF, the photo and the Google Doc
  // (exported as text) those boards show, already filed rather than
  // pending — the scripted run's own three inbox items are untouched.
  // Pinned to Home (#489, `Demo-Home` board): a note pin, not a folder
  // pin — `hydratePinnedAt` (`vault-store.tsx`) checks every note before
  // any folder note, capped at `PINNED_HYDRATION_FETCH_CAP` (12) fetches
  // per load, and the fixture has ~30; a folder pin would never be
  // reached on a first, cold-cache visit. "Flat hunt.md" sorts 4th by
  // path, well inside the cap, so this one reliably shows. See the PR's
  // "Left out" for the board's folder-style tile ("1-Projects · 6
  // things"), not reproduced here for the same reason.
  note(
    '4-Archives/Flat hunt/Flat hunt.md',
    27,
    'project, hub, home',
    `# Flat hunt

Looking for a one-bedroom before the current lease runs out in December.

- [[Lease agreement 2026]]
- [[Notes from the viewing]]

## Still open
- Ask about the deposit protection scheme
- Compare the bike commute for each one`,
    'status: active\n',
  ),
  {
    path: '4-Archives/Flat hunt/Lease agreement 2026.pdf',
    mimeType: 'application/pdf',
    modifiedTime: at(27, '0930'),
    content: new Blob([LEASE_PDF], { type: 'application/pdf' }),
    size: Math.round(1.1 * 1024 * 1024),
    thumbnailLink: thumb('Lease agreement', '#e8eef7'),
    appProperties: { bowerOrigin: 'filed' },
  },
  // A photo from the viewing: the same tiny stub PNG as the garden test
  // patch, filed with a camera-style name (spec D.1's own example).
  {
    path: '4-Archives/Flat hunt/Arlington Road, window sign.jpg',
    mimeType: 'image/jpeg',
    modifiedTime: at(27, '0935'),
    content: pngBlob(TEST_PATCH_PNG),
    size: Math.round(2.4 * 1024 * 1024),
    thumbnailLink: thumb('TO LET', '#f4e9c9'),
    imageMediaMetadata: {
      time: '2026:09:26 10:14:00',
      width: 4032,
      height: 3024,
    },
  },
  // A Google Doc, exported as text (#367): a plain Markdown note, the way
  // `drive.ts#exportPlanFor` saves one from a real Drive pick.
  note(
    '4-Archives/Flat hunt/Notes from the viewing.md',
    27,
    'document, home',
    `# Notes from the viewing

Arlington Road, one bedroom, top floor. Bright kitchen, small garden share. The landlord said the boiler was replaced last year. Ten minutes' walk to the station, twenty-five minutes to the office by bike.`,
  ),

  // --- Areas ---------------------------------------------------------------
  { path: '2-Areas/_Areas.md', content: areasNote, modifiedTime: at(1) },
  note(
    '3-Resources/Home/Home.md',
    15,
    'area, hub, home',
    `# Home

- [[Boiler]]
- [[Bills and renewals]]
- [[Shopping list]]
- Project: [[Kitchen Refresh]]`,
  ),
  // Pinned to Home (#489, `Demo-Home` board: "Shopping list · 2-Areas /
  // Home"), sorting near the middle of the fixture's notes by path,
  // exactly the case #539's search-first hydration exists for.
  note(
    '3-Resources/Home/Shopping list.md',
    25,
    'inventory, home',
    `# Shopping list

- Milk, eggs, bread
- Washing-up liquid
- Light bulbs for the hallway
- Bin bags

Part of [[Home]].`,
  ),
  note(
    '3-Resources/Home/Boiler.md',
    15,
    'document, home',
    `# Boiler

Serviced once a year, in September. Last service: September last year. The engineer's number is on the sticker under the boiler.

Part of [[Home]].`,
  ),
  note(
    '3-Resources/Home/Bills and renewals.md',
    21,
    'inventory, home, finance',
    `# Bills and renewals

- Home insurance: renews 3 November
- Broadband: contract ends in January
- Streaming: monthly, cancel after the series ends

See [[2026-09-21 Which subscriptions renew this autumn]].`,
  ),
  note(
    '3-Resources/Health/Health.md',
    10,
    'area, hub, health',
    `# Health

- [[Running log]]
- Project: [[Half Marathon]]
- Dentist check-up due in December.`,
  ),
  note(
    '3-Resources/Health/Running log.md',
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
    '3-Resources/Money/Money.md',
    8,
    'area, hub, finance',
    `# Money

- [[Monthly budget]]
- [[Bills and renewals]]`,
  ),
  note(
    '3-Resources/Money/Monthly budget.md',
    8,
    'guide, finance',
    `# Monthly budget

Rent, bills and food first; then 10% saved on payday; the rest is free. The kitchen and the trip come out of savings this autumn.`,
  ),
  note(
    '3-Resources/Garden/Garden.md',
    14,
    'area, hub, hobby',
    `# Garden

The small back garden: three beds and a herb corner.

![[Garden plan.svg]]

- [[Watering schedule]]`,
  ),
  {
    path: '3-Resources/Garden/Garden plan.svg',
    mimeType: 'image/svg+xml',
    modifiedTime: at(14),
    content: new Blob([GARDEN_PLAN_SVG], { type: 'image/svg+xml' }),
  },
  note(
    '3-Resources/Garden/Watering schedule.md',
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
  // Two suggestions waiting for Alex, so the Bower tab's Suggested group
  // shows Accept and Dismiss and Health points there (#199, #346), and one
  // already dismissed, which the list leaves out.
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

## Bike time on every listing
- id: 2026-09-28-bike-time
- kind: rule
- text: For every flat listing, add the bike time to your office.
- evidence: You asked about bike times twice this week, and you cycle to work.
- status: open
- created: 2026-09-28

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

## Bower's note
- ✅ Broadband runs until January, so nothing to do this autumn.
- ⚠️ Home insurance renews on 3 November; no note says what it cost last year.
- ❌ The streaming service renews every month until you cancel it.

## Why
Home insurance on 3 November, and the streaming service every month until you cancel it. Broadband runs until January.

## What Bower used
- [[Bills and renewals]] (from your notes)`,
  ),

  ...V4_FILES,
  // Last, so the older files keep their demo ids (`demo-<n>`) the tests use.
  ...V6_WORLD,
];

/**
 * What the scripted tidy-up also files (#674, boards `Flow-05-Home`,
 * `Phone-JustFiled`): the flat listings, each with the companion note that
 * carries `kind: rental-listing`, and the clause Home's bubble adds.
 */
export const SCRIPTED_LISTINGS: readonly RunItem[] = (
  DEMO_RUNS.find((run) => run.runId === 'demo-run-earlier-4')?.items ?? []
).filter((item) => /^4-Archives\/Flat hunt\/.*\.pdf$/.test(item.to ?? ''));

// --- Test states (#735, spec §7c item 4) --------------------------------
// Extra vault shapes and run states the v5 tests need. Nothing here is part
// of the demo's normal story: `FIXTURE_FILES` and `DEMO_RUNS` stay as they
// were, and a test picks one of these to swap in.

/** The folder that exists with nothing in it (see `FIXTURE_FOLDERS`). */
export const EMPTY_FOLDER = '3-Resources/Car';

/** Whether a path is waiting to be tidied: in an inbox folder, outside
 * `Processed` and `Quarantine`, and not a folder's own `_note.md` (the rule
 * `pendingCount` reads). */
function isPendingPath(path: string): boolean {
  const segments = path.split('/');
  const name = segments[segments.length - 1] ?? '';
  if (segments[0] !== '0-Inbox' && segments[0] !== 'Clippings') return false;
  if (segments.includes('Processed')) return false;
  if (segments[0] === '0-Inbox' && segments[1] === 'Quarantine') return false;
  return !(name.startsWith('_') && name.toLowerCase().endsWith('.md'));
}

/** The demo's files with nothing waiting to be tidied: an empty inbox. */
export const EMPTY_INBOX_FILES: readonly FixtureFile[] = FIXTURE_FILES.filter(
  (file) => !isPendingPath(file.path),
);

/** The folder the long tree lives in. */
export const LONG_TREE_FOLDER = '4-Archives/Long tree';

/** How many notes `LONG_TREE_FILES` holds: with the folders already in the
 * demo this puts the tree well over 150 rows. */
export const LONG_TREE_COUNT = 160;

/** A folder of 160 small notes, for the tree's long-list behaviour. */
export const LONG_TREE_FILES: readonly FixtureFile[] = Array.from(
  { length: LONG_TREE_COUNT },
  (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    return note(
      `${LONG_TREE_FOLDER}/Old note ${number}.md`,
      1 + (index % 27),
      'archive',
      `# Old note ${number}\n\nNothing here but a line to fill the tree.`,
    );
  },
);

/** The demo's files plus the long tree. */
export const LONG_TREE_VAULT: readonly FixtureFile[] = [
  ...FIXTURE_FILES,
  ...LONG_TREE_FILES,
];

/**
 * A run in each state the app tells apart (spec §7c item 4), built with the
 * shared run builders (#728): held running (writing, 1 of 2), done, partly
 * done (failed after writing some notes) and failed (nothing changed). A test
 * serves one as the current run and moves the clock with
 * `page.clock.fastForward` to reach the next.
 */
export const DEMO_RUN_STATES: Readonly<
  Record<'running' | 'done' | 'partial' | 'failed', Run>
> = {
  running: buildRun('running'),
  done: buildRun('done'),
  partial: buildRun('partial'),
  failed: buildRun('failed'),
};
