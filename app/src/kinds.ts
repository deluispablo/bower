/**
 * The kinds contract (issue #577, spec §7 R-AG-1/R-AG-2, board
 * `System-Kinds`): the eight kinds of document Bower recognises, the fields
 * it writes into a companion note's frontmatter for each, which of them are
 * key facts, how Details groups them, the status values and how Compare uses
 * the kind.
 *
 * The agent writes these fields; the app only shows them ("The app only
 * shows, no AI"). The rulebook (`vault-template/CLAUDE.md`, #600) carries a
 * copy of this table and a test keeps the two equal, so a change here is a
 * change to the agent's rules too.
 *
 * Everything here is pure: no Drive, no clock, no locale. Values are
 * formatted the way the boards draw them ("£2,150", "1 Nov", "Jul 2027").
 */

/** How a field's raw frontmatter value is read and shown. `money` carries
 * its currency; `date` is `YYYY-MM-DD`, or `YYYY-MM` when only the month is
 * known; `note-link` is an Obsidian `[[wikilink]]` to another note. */
export type FieldType =
  'text' | 'number' | 'money' | 'date' | 'link' | 'note-link';

export interface KindField {
  /** The frontmatter key, snake_case. */
  key: string;
  /** The plain-words label Details shows ("Rent", "Bike to the office"). */
  label: string;
  type: FieldType;
  /** One of the kind's `groups`. */
  group: string;
  /** The field comes from the person's own notes, not the document. */
  forYou?: boolean;
  /**
   * The label under the value when the field is a key fact (board
   * `System-KeyFacts`: "a month" under "£2,150"), at most 14 characters.
   * Defaults to `label` in lower case. It may name other fields as
   * `{key}`; a part in `[…]` is dropped when a field it names is missing
   * ("total[ at {shop}][, {date}]"). `{rest}` splits the value itself at
   * its first ", ": the value keeps the part before, the label is the part
   * after ("2 bed, 1 bath" shows "2 bed" over "1 bath").
   */
  factLabel?: string;
  /** The Compare column header when it differs from `label`
   * (board `Desktop-Compare`: "Rent a month"). */
  compareLabel?: string;
}

export interface Kind {
  /** The frontmatter `kind` value the agent writes. */
  id: string;
  /** Singular, in plain words: "rental listing". */
  name: string;
  /** Plural, in plain words: "rental listings". */
  plural: string;
  fields: KindField[];
  /** Field keys, in order, at most four. */
  keyFacts: string[];
  /** Details groups, in order. */
  groups: string[];
  /** The `status` values, in order; empty when the kind has none. */
  statuses: string[];
  compare: 'table' | 'by-month' | 'timeline' | 'rarely' | 'none';
  /** Field keys Compare shows as columns, in order; Status follows them
   * when the kind has statuses. Empty when the kind has no Compare table. */
  compareFields: string[];
  /** The Details button for the "Not in the …" fields; `{n}` is replaced by
   * a number word ("copy these three as questions"). */
  questionsLabel: string;
  /** The heading over the fields the document did not state. */
  notStatedLabel: string;
}

export const KINDS: readonly Kind[] = [
  {
    id: 'rental-listing',
    name: 'rental listing',
    plural: 'rental listings',
    groups: ['The place', 'Money', 'Terms and dates', 'For you'],
    fields: [
      { key: 'address', label: 'Address', type: 'text', group: 'The place' },
      { key: 'type', label: 'Type', type: 'text', group: 'The place' },
      {
        key: 'rooms',
        label: 'Rooms',
        type: 'text',
        group: 'The place',
        factLabel: '{rest}',
      },
      {
        key: 'rent',
        label: 'Rent',
        type: 'money',
        group: 'Money',
        factLabel: 'a month',
        compareLabel: 'Rent a month',
      },
      { key: 'deposit', label: 'Deposit', type: 'money', group: 'Money' },
      {
        key: 'against_area',
        label: 'Against the area',
        type: 'text',
        group: 'Money',
      },
      {
        key: 'available',
        label: 'Available',
        type: 'date',
        group: 'Terms and dates',
        factLabel: 'available',
      },
      { key: 'lease', label: 'Lease', type: 'text', group: 'Terms and dates' },
      {
        key: 'listed',
        label: 'Listed',
        type: 'date',
        group: 'Terms and dates',
      },
      {
        key: 'viewing',
        label: 'Viewing',
        type: 'date',
        group: 'Terms and dates',
      },
      {
        key: 'bike_to_office',
        label: 'Bike to the office',
        type: 'text',
        group: 'For you',
        forYou: true,
        factLabel: 'bike to work',
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'number',
        group: 'For you',
        forYou: true,
      },
    ],
    keyFacts: ['rent', 'rooms', 'available', 'bike_to_office'],
    statuses: ['new', 'to view', 'viewed', 'applied', 'rejected'],
    compare: 'table',
    compareFields: [
      'rent',
      'rooms',
      'available',
      'against_area',
      'bike_to_office',
      'fit',
    ],
    questionsLabel: 'Ask the agent: copy these {n} as questions',
    notStatedLabel: 'Not in the listing',
  },
  {
    id: 'job-offer',
    name: 'job offer',
    plural: 'job offers',
    groups: ['The role', 'Money', 'Dates', 'For you'],
    fields: [
      { key: 'role', label: 'Role', type: 'text', group: 'The role' },
      { key: 'employer', label: 'Employer', type: 'text', group: 'The role' },
      { key: 'office', label: 'Office', type: 'text', group: 'The role' },
      { key: 'hours', label: 'Hours', type: 'text', group: 'The role' },
      {
        key: 'salary',
        label: 'Salary',
        type: 'money',
        group: 'Money',
        factLabel: 'a year',
      },
      { key: 'bonus', label: 'Bonus', type: 'text', group: 'Money' },
      { key: 'holiday', label: 'Holiday', type: 'text', group: 'Money' },
      { key: 'starts', label: 'Starts', type: 'date', group: 'Dates' },
      { key: 'reply_by', label: 'Reply by', type: 'date', group: 'Dates' },
      {
        key: 'commute',
        label: 'Commute',
        type: 'text',
        group: 'For you',
        forYou: true,
      },
    ],
    keyFacts: ['salary', 'office', 'starts', 'reply_by'],
    statuses: ['new', 'applied', 'interview', 'offer', 'declined'],
    compare: 'table',
    compareFields: [
      'salary',
      'office',
      'starts',
      'reply_by',
      'holiday',
      'commute',
    ],
    questionsLabel: 'Ask the employer: copy these {n} as questions',
    notStatedLabel: 'Not in the offer',
  },
  {
    id: 'bill',
    name: 'bill or renewal',
    plural: 'bills and renewals',
    groups: ['The service', 'Money', 'Dates'],
    fields: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'text',
        group: 'The service',
      },
      { key: 'service', label: 'What for', type: 'text', group: 'The service' },
      { key: 'amount', label: 'Amount', type: 'money', group: 'Money' },
      { key: 'billed', label: 'How often', type: 'text', group: 'Money' },
      {
        key: 'renews_on',
        label: 'Renews on',
        type: 'date',
        group: 'Dates',
        factLabel: 'renews',
      },
      { key: 'since', label: 'Since', type: 'date', group: 'Dates' },
      {
        key: 'notice',
        label: 'Notice to cancel',
        type: 'text',
        group: 'Dates',
      },
    ],
    keyFacts: ['provider', 'amount', 'renews_on'],
    statuses: ['active', 'to renew', 'cancelled'],
    compare: 'table',
    compareFields: ['provider', 'amount', 'billed', 'renews_on'],
    questionsLabel: 'Ask the provider: copy these {n} as questions',
    notStatedLabel: 'Not in the bill',
  },
  {
    id: 'receipt',
    name: 'receipt',
    plural: 'receipts',
    groups: ['The purchase', 'Money', 'Returns'],
    fields: [
      { key: 'shop', label: 'Shop', type: 'text', group: 'The purchase' },
      { key: 'date', label: 'Date', type: 'date', group: 'The purchase' },
      {
        key: 'items',
        label: 'What you bought',
        type: 'text',
        group: 'The purchase',
      },
      {
        key: 'total',
        label: 'Total',
        type: 'money',
        group: 'Money',
        factLabel: 'total[ at {shop}][, {date}]',
      },
      { key: 'paid_with', label: 'Paid with', type: 'text', group: 'Money' },
      { key: 'return_by', label: 'Return by', type: 'date', group: 'Returns' },
      { key: 'warranty', label: 'Warranty', type: 'text', group: 'Returns' },
    ],
    keyFacts: ['total'],
    statuses: [],
    compare: 'by-month',
    compareFields: [],
    questionsLabel: 'Ask the shop: copy these {n} as questions',
    notStatedLabel: 'Not on the receipt',
  },
  {
    id: 'payslip',
    name: 'payslip',
    plural: 'payslips',
    groups: ['The period', 'Pay', 'Deductions'],
    fields: [
      { key: 'month', label: 'Month', type: 'date', group: 'The period' },
      { key: 'employer', label: 'Employer', type: 'text', group: 'The period' },
      { key: 'paid_on', label: 'Paid on', type: 'date', group: 'The period' },
      {
        key: 'net',
        label: 'Net pay',
        type: 'money',
        group: 'Pay',
        factLabel: 'net',
      },
      {
        key: 'gross',
        label: 'Gross pay',
        type: 'money',
        group: 'Pay',
        factLabel: 'gross',
      },
      { key: 'tax', label: 'Tax', type: 'money', group: 'Deductions' },
      { key: 'pension', label: 'Pension', type: 'money', group: 'Deductions' },
      {
        key: 'other_deductions',
        label: 'Other deductions',
        type: 'money',
        group: 'Deductions',
      },
    ],
    keyFacts: ['month', 'net', 'gross'],
    statuses: [],
    compare: 'table',
    compareFields: ['month', 'net', 'gross', 'tax', 'pension'],
    questionsLabel: 'Ask payroll: copy these {n} as questions',
    notStatedLabel: 'Not on the payslip',
  },
  {
    id: 'contract',
    name: 'contract or agreement',
    plural: 'contracts and agreements',
    groups: ['The agreement', 'Money', 'Dates'],
    fields: [
      { key: 'with', label: 'With', type: 'text', group: 'The agreement' },
      {
        key: 'covers',
        label: 'What it covers',
        type: 'text',
        group: 'The agreement',
      },
      {
        key: 'value',
        label: 'Value',
        type: 'money',
        group: 'Money',
        factLabel: '[{covers} ]value',
      },
      { key: 'payments', label: 'Payments', type: 'text', group: 'Money' },
      { key: 'starts', label: 'Starts', type: 'date', group: 'Dates' },
      { key: 'ends', label: 'Ends', type: 'date', group: 'Dates' },
      { key: 'notice', label: 'Notice to end', type: 'text', group: 'Dates' },
    ],
    keyFacts: ['value', 'ends'],
    statuses: [],
    compare: 'rarely',
    compareFields: [],
    questionsLabel: 'Ask the other side: copy these {n} as questions',
    notStatedLabel: 'Not in the contract',
  },
  {
    id: 'booking',
    name: 'booking or ticket',
    plural: 'bookings and tickets',
    groups: ['The booking', 'When and where', 'Money', 'For you'],
    fields: [
      { key: 'what', label: 'What', type: 'text', group: 'The booking' },
      {
        key: 'reference',
        label: 'Reference',
        type: 'text',
        group: 'The booking',
      },
      {
        key: 'booking_page',
        label: 'Booking page',
        type: 'link',
        group: 'The booking',
      },
      { key: 'when', label: 'When', type: 'date', group: 'When and where' },
      { key: 'until', label: 'Until', type: 'date', group: 'When and where' },
      { key: 'where', label: 'Where', type: 'text', group: 'When and where' },
      { key: 'price', label: 'Price', type: 'money', group: 'Money' },
      { key: 'cancel_by', label: 'Cancel by', type: 'date', group: 'Money' },
      {
        key: 'getting_there',
        label: 'Getting there',
        type: 'text',
        group: 'For you',
        forYou: true,
      },
    ],
    keyFacts: ['when', 'where', 'reference'],
    statuses: [],
    compare: 'timeline',
    compareFields: [],
    questionsLabel: 'Ask the organiser: copy these {n} as questions',
    notStatedLabel: 'Not in the booking',
  },
  {
    id: 'recipe',
    name: 'recipe',
    plural: 'recipes',
    groups: ['The dish', 'Cooking'],
    fields: [
      { key: 'dish', label: 'Dish', type: 'text', group: 'The dish' },
      {
        key: 'main_ingredients',
        label: 'Main ingredients',
        type: 'text',
        group: 'The dish',
      },
      { key: 'diet', label: 'Diet', type: 'text', group: 'The dish' },
      { key: 'source', label: 'Source', type: 'link', group: 'The dish' },
      { key: 'time', label: 'Time', type: 'text', group: 'Cooking' },
      { key: 'serves', label: 'Serves', type: 'number', group: 'Cooking' },
      {
        key: 'difficulty',
        label: 'Difficulty',
        type: 'text',
        group: 'Cooking',
      },
    ],
    keyFacts: ['time', 'serves'],
    statuses: [],
    compare: 'table',
    compareFields: ['time', 'serves', 'main_ingredients', 'diet', 'difficulty'],
    questionsLabel: 'Look up: copy these {n} as questions',
    notStatedLabel: 'Not in the recipe',
  },
];

/** The kind a note's frontmatter `kind` names, or `undefined` for "anything
 * else" (no kind, no key facts, no Compare). */
export function kindById(id: string): Kind | undefined {
  return KINDS.find((kind) => kind.id === id);
}

const MONTHS = [
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
  'Nov',
  'Dec',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: '£',
  EUR: '€',
  USD: '$',
};

/** Digits with a comma every three, and two decimals only when there are
 * pence ("2,150", "38.40"). */
function groupThousands(amount: number): string {
  const fixed = Number.isInteger(amount)
    ? amount.toFixed(0)
    : amount.toFixed(2);
  const [whole = '', decimals] = fixed.split('.');
  const sign = whole.startsWith('-') ? '-' : '';
  const digits = sign === '' ? whole : whole.slice(1);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped + (decimals === undefined ? '' : '.' + decimals);
}

/** A money value: a bare number is in pounds; a string may carry a symbol
 * (£ € $) or a code (GBP EUR USD) before or after the amount. Anything that
 * does not read as an amount is shown as written. */
function formatMoney(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw))
    return '£' + groupThousands(raw);
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  const match = /^([£€$]|[A-Z]{3})?\s*(-?[\d,]*\.?\d+)\s*([A-Z]{3})?$/.exec(
    text,
  );
  if (match === null) return text;
  const [, before, digits = '', after] = match;
  const amount = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return text;
  const code = before ?? after;
  if (code === undefined) return '£' + groupThousands(amount);
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  if (symbol.length === 3) return groupThousands(amount) + ' ' + symbol;
  return symbol + groupThousands(amount);
}

/** `[year, month, day?]` from `YYYY-MM-DD`, `YYYY-MM` or a `Date`, or
 * `null` when the value is not a date. */
function dateParts(raw: unknown): [number, number, number | undefined] | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return [raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate()];
  }
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(raw.trim());
  if (match === null) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return [
    Number(match[1]),
    month,
    match[3] === undefined ? undefined : Number(match[3]),
  ];
}

/** A date as the boards show it: "1 Nov" for a day, "Jul 2027" for a month
 * only. Anything else is shown as written. */
function formatDate(raw: unknown): string {
  const parts = dateParts(raw);
  if (parts === null) return typeof raw === 'string' ? raw.trim() : '';
  const [year, month, day] = parts;
  const name = MONTHS[month - 1] ?? '';
  return day === undefined ? `${name} ${year}` : `${day} ${name}`;
}

/** A scalar or a list as plain text; objects and blanks are ''. */
function plainText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (Array.isArray(raw)) {
    return raw
      .map((item) => plainText(item))
      .filter((item) => item !== '')
      .join(', ');
  }
  return '';
}

/** A field's raw frontmatter value as display text; '' when there is
 * nothing to show. Money gets its currency symbol and thousands separators
 * ("£2,150"), dates read "1 Nov" or "Jul 2027", numbers stay plain, and a
 * note link shows the note's name without its brackets. */
export function formatFieldValue(field: KindField, raw: unknown): string {
  switch (field.type) {
    case 'money':
      return formatMoney(raw);
    case 'date':
      return formatDate(raw);
    case 'note-link':
      return plainText(raw)
        .replace(/^\[\[/, '')
        .replace(/\]\]$/, '')
        .replace(/\|.*$/, '');
    case 'number':
    case 'text':
    case 'link':
      return plainText(raw);
  }
}

/** `template` with `{key}` filled from the note's other fields; a `[…]`
 * part naming a missing field is dropped. */
function fillLabel(
  kind: Kind,
  template: string,
  frontmatter: Record<string, unknown>,
): string {
  const value = (key: string): string => {
    const field = kind.fields.find((candidate) => candidate.key === key);
    return field === undefined ? '' : formatFieldValue(field, frontmatter[key]);
  };
  const withOptional = template.replace(/\[([^\]]*)\]/g, (_, part: string) => {
    const keys = [...part.matchAll(/\{(\w+)\}/g)].map(
      (found) => found[1] ?? '',
    );
    return keys.every((key) => value(key) !== '') ? part : '';
  });
  return withOptional
    .replace(/\{(\w+)\}/g, (_, key: string) => value(key))
    .trim();
}

/** The note's key facts: the kind's key fields actually present, in the
 * kind's order, at most four. A missing field is left out, never shown
 * empty or as "—". */
export function keyFactsFor(
  kind: Kind,
  frontmatter: Record<string, unknown>,
): { value: string; label: string; key: string }[] {
  const facts: { value: string; label: string; key: string }[] = [];
  for (const key of kind.keyFacts) {
    const field = kind.fields.find((candidate) => candidate.key === key);
    if (field === undefined) continue;
    const value = formatFieldValue(field, frontmatter[key]);
    if (value === '') continue;
    const template = field.factLabel ?? field.label.toLowerCase();
    if (template === '{rest}') {
      const comma = value.indexOf(', ');
      facts.push(
        comma === -1
          ? { value, label: '', key }
          : {
              value: value.slice(0, comma),
              label: value.slice(comma + 2),
              key,
            },
      );
    } else {
      facts.push({ value, label: fillLabel(kind, template, frontmatter), key });
    }
    if (facts.length === 4) break;
  }
  return facts;
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** The kind's questions button for `n` fields not stated: `{n}` as a
 * number word ("copy these three as questions"), "copy this one as a
 * question" for one. */
export function questionsLabelFor(kind: Kind, n: number): string {
  if (n === 1)
    return kind.questionsLabel.replace(
      'these {n} as questions',
      'this one as a question',
    );
  return kind.questionsLabel.replace('{n}', NUMBER_WORDS[n] ?? String(n));
}

/** The Status cell for a note of this kind, '' when it has none. A listing
 * to view with a viewing date reads "Viewing Sat" (board `Desktop-Compare`);
 * otherwise the status with a capital ("To view"), including a value a
 * rule added that is not in the kind's list. */
export function statusLabel(
  kind: Kind,
  frontmatter: Record<string, unknown>,
): string {
  const status = plainText(frontmatter.status).toLowerCase();
  if (status === '') return '';
  if (
    status === 'to view' &&
    kind.fields.some((field) => field.key === 'viewing')
  ) {
    const parts = dateParts(frontmatter.viewing);
    if (parts !== null && parts[2] !== undefined) {
      const weekday = new Date(
        Date.UTC(parts[0], parts[1] - 1, parts[2]),
      ).getUTCDay();
      return `Viewing ${WEEKDAYS[weekday] ?? ''}`;
    }
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}
