import type { AbstractScheduler } from '../abstract_scheduler';
import type { TSeedStrategy } from './types';
export declare function DefaultInitSeedStrategy(this: AbstractScheduler): string;
/**
 * Generates a seed strategy function for card IDs.
 *
 * @param card_id_field - The field name of the card ID in the current object.
 * @returns A function that generates a seed based on the card ID and repetitions.
 *
 * @remarks
 * The returned function uses the `card_id_field` to retrieve the card ID from the current object.
 * It then adds the number of repetitions (`reps`) to the card ID to generate the seed.
 *
 * @example
 * ```typescript
 * const seedStrategy = GenCardIdSeedStrategy('card_id');
 * const f = fsrs().useStrategy(StrategyMode.SEED, seedStrategy)
 * const card = createEmptyCard<Card & { card_id: number }>()
 * card.card_id = 555
 * const record = f.repeat(card, new Date())
 * ```
 */
export declare function GenSeedStrategyWithCardId(card_id_field: string | number): TSeedStrategy;
