import type { FSRSAlgorithm } from './algorithm';
import { type Card, type CardInput, type DateInput, type Grade, type RecordLogItem, type ReviewLog } from './models';
import { StrategyMode, type TStrategyHandler } from './strategies/types';
import type { IPreview, IScheduler } from './types';
export declare abstract class AbstractScheduler implements IScheduler {
    protected last: Card;
    protected current: Card;
    protected review_time: Date;
    protected next: Map<Grade, RecordLogItem>;
    protected algorithm: FSRSAlgorithm;
    protected strategies: Map<StrategyMode, TStrategyHandler> | undefined;
    protected elapsed_days: number;
    constructor(card: CardInput | Card, now: DateInput, algorithm: FSRSAlgorithm, strategies?: Map<StrategyMode, TStrategyHandler>);
    protected checkGrade(grade: Grade): void;
    private init;
    preview(): IPreview;
    private previewIterator;
    review(grade: Grade): RecordLogItem;
    protected abstract newState(grade: Grade): RecordLogItem;
    protected abstract learningState(grade: Grade): RecordLogItem;
    protected abstract reviewState(grade: Grade): RecordLogItem;
    protected buildLog(rating: Grade): ReviewLog;
}
