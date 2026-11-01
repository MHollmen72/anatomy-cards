// Export / import of study progress, and merging progress with a rebuilt deck.
import type { CardData, CardProgress, DayCounter, ProgressSnapshot, ReviewLogEntry } from './types.js';

export function makeSnapshot(
  cards: readonly CardProgress[],
  log: readonly ReviewLogEntry[],
  counter: DayCounter,
  now: Date,
): ProgressSnapshot {
  return {
    format: 'anatomy-cards-progress',
    version: 1,
    exportedAt: now.toISOString(),
    cards: cards.map((c) => ({ ...c, fsrs: { ...c.fsrs } })),
    log: log.map((e) => ({ ...e })),
    counter: { ...counter },
  };
}

/** Parses and checks an imported file. Throws an Error with a readable message if invalid. */
export function parseSnapshot(text: string): ProgressSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const s = data as Partial<ProgressSnapshot>;
  if (!s || s.format !== 'anatomy-cards-progress' || s.version !== 1) {
    throw new Error('This file is not an Anatomy Cards progress export.');
  }
  if (!Array.isArray(s.cards) || !Array.isArray(s.log) || !s.counter) {
    throw new Error('The export file is incomplete.');
  }
  for (const c of s.cards) {
    if (typeof c?.id !== 'string' || !c.fsrs || typeof c.fsrs.due !== 'string' || Number.isNaN(Date.parse(c.fsrs.due))) {
      throw new Error('The export file contains a damaged card record.');
    }
  }
  return s as ProgressSnapshot;
}

/**
 * Marks progress for cards no longer in the deck as archived (kept, not deleted),
 * and un-archives cards that have come back. Returns only records that changed.
 */
export function reconcile(progress: readonly CardProgress[], deck: readonly CardData[]): CardProgress[] {
  const ids = new Set(deck.map((c) => c.id));
  const changed: CardProgress[] = [];
  for (const p of progress) {
    const inDeck = ids.has(p.id);
    if (!inDeck && !p.archived) changed.push({ ...p, archived: true });
    if (inDeck && p.archived) {
      const { archived: _a, ...rest } = p;
      changed.push(rest);
    }
  }
  return changed;
}

export function daysSince(iso: string | undefined, now: Date): number {
  if (!iso) return Infinity;
  return (now.getTime() - Date.parse(iso)) / 86_400_000;
}
