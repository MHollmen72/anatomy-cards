// Shared types for the compiled deck (produced by scripts/build_data.py)
// and for study progress stored on the device.

export type Letter = 'P' | 'N' | 'U' | 'A' | 'S' | 'F' | 'R' | 'W' | 'L';

/** One block of an answer. `part` is set for multi-part muscles or multi-band ligaments. */
export interface AnswerGroup {
  part?: string;
  lines: string[];
}

export interface SourceRef {
  id: string;
  title: string;
  url: string;
}

export interface CardData {
  /** Stable ID: structure ID + ":" + letter, e.g. "m.deltoideus:N". Never changes when facts are corrected. */
  id: string;
  structureId: string;
  kind: 'muscle' | 'ligament';
  name: string;
  synonyms: string[];
  region: string;
  letter: Letter;
  /** English meaning of the letter, e.g. "Innervation". */
  label: string;
  answer: AnswerGroup[];
  sources: SourceRef[];
  image: string | null;
}

/** A rectangle hiding a label on the question side, in percent of image width/height. */
export interface Mask {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageData {
  id: string;
  src: string;
  alt: string;
  author: string;
  licence: string;
  licenceUrl: string;
  filePage: string;
  modified: string;
  masks: Mask[];
}

export interface Deck {
  generated: string;
  prototype: boolean;
  heldBack: number;
  cards: CardData[];
  images: Record<string, ImageData>;
}

/** FSRS card state as stored (dates as ISO strings). */
export interface StoredFsrs {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface CardProgress {
  id: string;
  fsrs: StoredFsrs;
  flagged: boolean;
  confirmed: boolean;
  suspended: boolean;
  /** Set when the card no longer exists in the deck; progress is kept, not deleted. */
  archived?: boolean;
}

export interface ReviewLogEntry {
  cardId: string;
  at: string;
  knew: boolean;
  /** FSRS state before grading: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  stateBefore: number;
}

export interface DayCounter {
  date: string;
  newCount: number;
  reviewCount: number;
}

export interface ProgressSnapshot {
  format: 'anatomy-cards-progress';
  version: 1;
  exportedAt: string;
  cards: CardProgress[];
  log: ReviewLogEntry[];
  counter: DayCounter;
}
