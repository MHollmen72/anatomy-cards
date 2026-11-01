// Thin wrapper around ts-fsrs (vendored, v5.4.2).
//
// Settings chosen for this app (see Phase 2/3 specification):
// - Binary grading: "I knew this" = Rating.Good, "I didn't know this" = Rating.Again.
// - enable_short_term = false and no learning steps: a passed card goes straight to a
//   multi-day interval, so it never returns in the same session. Same-session repetition
//   of failed cards is handled by the session queue (session.ts), not by FSRS steps.
// - Target recall 90 %, FSRS default weights, fuzz on (spreads due dates slightly).
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
} from '../vendor/ts-fsrs/index.js';
import type { StoredFsrs } from './types.js';

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    enable_fuzz: true,
    enable_short_term: false,
    learning_steps: [],
    relearning_steps: [],
  }),
);

export { State };

export function newCard(now: Date): StoredFsrs {
  return toStored(createEmptyCard(now));
}

export function grade(stored: StoredFsrs, knew: boolean, now: Date): StoredFsrs {
  const result = scheduler.next(fromStored(stored), now, knew ? Rating.Good : Rating.Again);
  return toStored(result.card);
}

export function isNew(stored: StoredFsrs): boolean {
  return stored.state === State.New;
}

export function isDue(stored: StoredFsrs, now: Date): boolean {
  return Date.parse(stored.due) <= now.getTime();
}

export function toStored(card: Card): StoredFsrs {
  const out: StoredFsrs = {
    due: new Date(card.due).toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  };
  if (card.last_review) out.last_review = new Date(card.last_review).toISOString();
  return out;
}

export function fromStored(s: StoredFsrs): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}
