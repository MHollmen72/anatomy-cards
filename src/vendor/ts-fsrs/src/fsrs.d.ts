import { FSRSAlgorithm } from './algorithm';
import { type Card, type CardInput, type DateInput, type FSRSHistory, type FSRSParameters, type Grade, type RecordLogItem, type ReviewLogInput } from './models';
import { StrategyMode, type TStrategyHandler } from './strategies/types';
import type { IPreview, IReschedule, RescheduleOptions } from './types';
type RequireOnly<A, K extends keyof A> = {
    [P in K]-?: A[P];
} & Partial<Omit<A, K>>;
export interface IFSRS {
    useStrategy<T extends StrategyMode>(mode: T, handler: TStrategyHandler<T>): this;
    clearStrategy(mode?: StrategyMode): this;
    repeat(card: CardInput | Card, now: DateInput): IPreview;
    repeat<R>(card: CardInput | Card, now: DateInput, afterHandler: (recordLog: IPreview) => R): R;
    next(card: CardInput | Card, now: DateInput, grade: Grade): RecordLogItem;
    next<R>(card: CardInput | Card, now: DateInput, grade: Grade, afterHandler: (recordLog: RecordLogItem) => R): R;
    get_retrievability(card: CardInput | Card, now?: DateInput, format?: true): string;
    get_retrievability(card: CardInput | Card, now?: DateInput, format?: false): number;
    rollback(card: CardInput | Card, log: ReviewLogInput): Card;
    rollback<R>(card: CardInput | Card, log: ReviewLogInput, afterHandler: (prevCard: Card) => R): R;
    forget(card: CardInput | Card, now: DateInput, reset_count?: boolean): RecordLogItem;
    forget<R>(card: CardInput | Card, now: DateInput, reset_count: boolean | undefined, afterHandler: (recordLogItem: RecordLogItem) => R): R;
    reschedule<T = RecordLogItem>(current_card: CardInput | Card, reviews?: FSRSHistory[], options?: RequireOnly<RescheduleOptions<T>, 'recordLogHandler'>): IReschedule<T>;
    reschedule(current_card: CardInput | Card, reviews?: FSRSHistory[], options?: Partial<RescheduleOptions<RecordLogItem>>): IReschedule<RecordLogItem>;
}
export declare class FSRS extends FSRSAlgorithm implements IFSRS {
    private strategyHandler;
    private Scheduler;
    constructor(param: Partial<FSRSParameters>);
    protected params_handler_proxy(): ProxyHandler<FSRSParameters>;
    useStrategy<T extends StrategyMode>(mode: T, handler: TStrategyHandler<T>): this;
    clearStrategy(mode?: StrategyMode): this;
    private getScheduler;
    repeat(card: CardInput | Card, now: DateInput): IPreview;
    repeat<R>(card: CardInput | Card, now: DateInput, afterHandler: (recordLog: IPreview) => R): R;
    next(card: CardInput | Card, now: DateInput, grade: Grade): RecordLogItem;
    next<R>(card: CardInput | Card, now: DateInput, grade: Grade, afterHandler: (recordLog: RecordLogItem) => R): R;
    get_retrievability(card: CardInput | Card, now?: DateInput, format?: true): string;
    get_retrievability(card: CardInput | Card, now?: DateInput, format?: false): number;
    rollback(card: CardInput | Card, log: ReviewLogInput): Card;
    rollback<R>(card: CardInput | Card, log: ReviewLogInput, afterHandler: (prevCard: Card) => R): R;
    forget(card: CardInput | Card, now: DateInput, reset_count?: boolean): RecordLogItem;
    forget<R>(card: CardInput | Card, now: DateInput, reset_count: boolean | undefined, afterHandler: (recordLogItem: RecordLogItem) => R): R;
    reschedule<T = RecordLogItem>(current_card: CardInput | Card, reviews: FSRSHistory[] | undefined, options: RequireOnly<RescheduleOptions<T>, 'recordLogHandler'>): IReschedule<T>;
    reschedule(current_card: CardInput | Card, reviews?: FSRSHistory[], options?: Partial<RescheduleOptions<RecordLogItem>>): IReschedule<RecordLogItem>;
}
/**
 * Create a new instance of TS-FSRS
 * @param params FSRSParameters
 * @example
 * ```typescript
 * const f = fsrs();
 * ```
 * @example
 * ```typescript
 * const params: FSRSParameters = generatorParameters({ maximum_interval: 1000 });
 * const f = fsrs(params);
 * ```
 * @example
 * ```typescript
 * const f = fsrs({ maximum_interval: 1000 });
 * ```
 */
export declare const fsrs: (params?: Partial<FSRSParameters>) => FSRS;
export {};
