import { type Card, type CardInput, Rating, type ReviewLog, type ReviewLogInput, State } from './models';
export declare class TypeConvert {
    static card<T extends Card | CardInput>(card: T): Card;
    static rating(value: unknown): Rating;
    static state(value: unknown): State;
    static time(value: unknown): Date;
    static review_log(log: ReviewLogInput | ReviewLog): ReviewLog;
}
