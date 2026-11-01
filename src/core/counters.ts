// "New today" and "Reviews today" counters; reset at local midnight.
import type { DayCounter } from './types.js';

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The counter as it applies today (zeroed if it belongs to an earlier day). */
export function today(counter: DayCounter | undefined, now: Date): DayCounter {
  const date = localDateKey(now);
  if (!counter || counter.date !== date) return { date, newCount: 0, reviewCount: 0 };
  return counter;
}

/** Count one grading. A card's first grading counts as new; every later one as a review. */
export function bump(counter: DayCounter | undefined, now: Date, wasNew: boolean): DayCounter {
  const c = today(counter, now);
  return wasNew
    ? { ...c, newCount: c.newCount + 1 }
    : { ...c, reviewCount: c.reviewCount + 1 };
}
