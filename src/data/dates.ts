const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The one way to write a day: "28 Sep" (the browser's own short months vary: Sept, sept). */
export function shortDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

/**
 * A Timeline date as the note shows it (TL-P2-20 R3-7 m8): a `YYYY-MM-DD` calendar day in the short form, "6 Oct",
 * read from the text itself so no time zone moves it; any other date ("2 Oct", "Today") stays as written.
 */
export function timelineDay(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const at = new Date(Date.UTC(2000, month - 1, day));
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day || (month === 2 && day === 29 && !leap(Number(match[1])))) return date;
  return `${day} ${MONTHS[month - 1] ?? ''}`;
}

const leap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
