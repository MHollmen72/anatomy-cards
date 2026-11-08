// Today's deck: every due card plus every new card, in random order, no daily cap.
import { isMastered } from './mastery.js';
import { isDue } from './scheduler.js';
import type { CardData, CardProgress } from './types.js';

export type Rng = () => number;

export function isStudyable(p: CardProgress | undefined): boolean {
  return !p || (!p.flagged && !p.suspended && !p.archived && !isMastered(p));
}

/** Card IDs for this session: due reviews and new cards, shuffled. */
export function buildQueue(
  cards: readonly CardData[],
  progress: ReadonlyMap<string, CardProgress>,
  now: Date,
  rng: Rng = Math.random,
): string[] {
  const ids: string[] = [];
  for (const card of cards) {
    const p = progress.get(card.id);
    if (!isStudyable(p)) continue;
    if (!p || isDue(p.fsrs, now)) ids.push(card.id);
  }
  return shuffle(ids, rng);
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

/**
 * A failed card goes back into the same session 3–5 cards later
 * (or to the end, if fewer cards remain). `queue` is the remaining queue
 * after the current card has been removed.
 */
export function requeueFailed(queue: readonly string[], cardId: string, rng: Rng = Math.random): string[] {
  const gap = 3 + Math.floor(rng() * 3); // 3, 4 or 5
  const at = Math.min(queue.length, gap);
  const out = queue.slice();
  out.splice(at, 0, cardId);
  return out;
}
