// Pure UTC-day bucketing for Admin Intelligence aggregates (safe to import
// anywhere, including server functions and tests).
//
// Buckets are UTC calendar days: unambiguous across staff timezones and
// directly comparable to timestamptz columns. (Per-product Lagos-day views
// can layer on later without changing these primitives.)
export const INTELLIGENCE_WINDOW_DAYS_DEFAULT = 30;
export const INTELLIGENCE_WINDOW_DAYS_MIN = 7;
export const INTELLIGENCE_WINDOW_DAYS_MAX = 90;

export interface DayPoint {
  /** UTC calendar day, YYYY-MM-DD. */
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** UTC calendar day (YYYY-MM-DD) of an instant, or null when unreadable. */
export function dayBucketKey(value: string): string | null {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * ISO instant of the UTC midnight that starts the oldest bucket: the
 * `days`-day window ending on the UTC date of `endIso` (inclusive).
 */
export function seriesStartIso(endIso: string, days: number): string {
  const endKey = dayBucketKey(endIso);
  const safeDays = Math.max(1, Math.floor(days));
  const endMidnight = endKey === null ? NaN : Date.parse(`${endKey}T00:00:00.000Z`);
  const start = Number.isNaN(endMidnight)
    ? Date.now() - (safeDays - 1) * DAY_MS
    : endMidnight - (safeDays - 1) * DAY_MS;
  return new Date(start).toISOString();
}

/**
 * Zero-filled daily series for the `days` UTC calendar days ending on the
 * UTC date of `endIso` (inclusive). Out-of-range and unreadable stamps are
 * ignored; the output always has exactly `days` points in ascending order.
 */
export function buildDaySeries(
  stamps: string[],
  days: number,
  endIso: string,
): DayPoint[] {
  const safeDays = Math.max(1, Math.floor(days));
  const endKey = dayBucketKey(endIso) ?? new Date().toISOString().slice(0, 10);
  const endMidnight = Date.parse(`${endKey}T00:00:00.000Z`);
  const counts = new Map<string, number>();
  for (const stamp of stamps) {
    const key = dayBucketKey(stamp);
    if (key === null) continue;
    const dayStart = Date.parse(`${key}T00:00:00.000Z`);
    const offset = Math.round((endMidnight - dayStart) / DAY_MS);
    if (offset < 0 || offset >= safeDays) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: DayPoint[] = [];
  for (let back = safeDays - 1; back >= 0; back -= 1) {
    const date = new Date(endMidnight - back * DAY_MS).toISOString().slice(0, 10);
    points.push({ date, count: counts.get(date) ?? 0 });
  }
  return points;
}
