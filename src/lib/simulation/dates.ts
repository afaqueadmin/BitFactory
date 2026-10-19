/** UTC day helpers. Days are keyed "YYYY-MM-DD", the same as Luxor's rows. */

const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function dayKey(date: Date): string {
  return utcDayStart(date).toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function parseDayKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Every day key from `from` to `to`, both inclusive. */
export function dayKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  for (
    let d = utcDayStart(from);
    d.getTime() <= utcDayStart(to).getTime();
    d = addDays(d, 1)
  ) {
    keys.push(dayKey(d));
  }
  return keys;
}

/** 00:00 UTC on the 1st of the month after `date`. */
export function nextMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}
