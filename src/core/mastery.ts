// Mastery and motivation rules.
//
// A card is "mastered" once it has been answered "I knew this" MASTERY_THRESHOLD times
// in total. Mastered cards are no longer shown for study (see session.ts).
import type { CardProgress, ReviewLogEntry } from './types.js';

export const MASTERY_THRESHOLD = 7;

/** Milestones: every NEW_STEP new cards learned, every MASTERED_STEP cards mastered. */
export const NEW_STEP = 50;
export const MASTERED_STEP = 25;

export function isMastered(p: CardProgress | undefined): boolean {
  return (p?.knewCount ?? 0) >= MASTERY_THRESHOLD;
}

/** Number of "I knew this" answers per card, from the review log (used to fill in older progress). */
export function knewCountsFromLog(log: readonly ReviewLogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of log) if (e.knew) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + 1);
  return counts;
}

export interface Totals {
  /** Cards the student has seen at least once (no longer new). */
  learned: number;
  mastered: number;
  total: number;
}

export function totals(progress: Iterable<CardProgress>, deckIds: ReadonlySet<string>): Totals {
  let learned = 0;
  let mastered = 0;
  for (const p of progress) {
    if (!deckIds.has(p.id)) continue;
    if (p.fsrs.reps > 0) learned++;
    if (isMastered(p)) mastered++;
  }
  return { learned, mastered, total: deckIds.size };
}

/** Whole percent, never shown as 100 % until every card really is mastered. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  const p = Math.floor((part / whole) * 100);
  return part < whole ? Math.min(p, 99) : 100;
}

/** The positive message for a grading that moved the totals from `before` to `after`, if any. */
export function milestone(before: Totals, after: Totals): string | null {
  if (after.total > 0 && after.mastered === after.total && before.mastered < before.total) {
    return `Every card mastered — all ${after.total}! Outstanding work.`;
  }
  const crossed = (a: number, b: number, step: number) => Math.floor(b / step) > Math.floor(a / step);
  if (crossed(before.mastered, after.mastered, MASTERED_STEP)) {
    return `${after.mastered} cards mastered — ${percent(after.mastered, after.total)} % of the deck. Excellent!`;
  }
  if (crossed(before.learned, after.learned, NEW_STEP)) {
    return `${after.learned} new cards learned. Great progress — keep it up!`;
  }
  return null;
}
