import { type Card, type DateInput, type FSRSParameters } from './models';
export declare const clipParameters: (parameters: number[], numRelearningSteps: number, enableShortTerm?: boolean) => number[];
/**
 * @returns The input if the parameters are valid, throws if they are invalid
 * @example
 * try {
 *   generatorParameters({
 *     w: checkParameters([0.40255])
 *   });
 * } catch (e: any) {
 *   alert(e);
 * }
 */
export declare const checkParameters: (parameters: number[] | readonly number[]) => number[] | readonly number[];
export declare const migrateParameters: (parameters?: number[] | readonly number[], numRelearningSteps?: number, enableShortTerm?: boolean) => number[];
export declare const generatorParameters: (props?: Partial<FSRSParameters>) => FSRSParameters;
/**
 * Create an empty card
 * @param now Current time
 * @param afterHandler Convert the result to another type. (Optional)
 * @example
 * ```typescript
 * const card: Card = createEmptyCard(new Date());
 * ```
 * @example
 * ```typescript
 * interface CardUnChecked
 *   extends Omit<Card, "due" | "last_review" | "state"> {
 *   cid: string;
 *   due: Date | number;
 *   last_review: Date | null | number;
 *   state: StateType;
 * }
 *
 * function cardAfterHandler(card: Card) {
 *      return {
 *       ...card,
 *       cid: "test001",
 *       state: State[card.state],
 *       last_review: card.last_review ?? null,
 *     } as CardUnChecked;
 * }
 *
 * const card: CardUnChecked = createEmptyCard(new Date(), cardAfterHandler);
 * ```
 */
export declare function createEmptyCard<R = Card>(now?: DateInput, afterHandler?: (card: Card) => R): R;
