import { AbstractScheduler } from '../abstract_scheduler';
import type { FSRSAlgorithm } from '../algorithm';
import { type Card, type CardInput, type DateInput, type Grade, type RecordLogItem } from '../models';
import { StrategyMode, type TStrategyHandler } from '../strategies';
export default class BasicScheduler extends AbstractScheduler {
    private learningStepsStrategy;
    constructor(card: CardInput | Card, now: DateInput, algorithm: FSRSAlgorithm, strategies?: Map<StrategyMode, TStrategyHandler>);
    private getLearningInfo;
    /**
     * @description This function applies the learning steps based on the current card's state and grade.
     */
    private applyLearningSteps;
    protected newState(grade: Grade): RecordLogItem;
    protected learningState(grade: Grade): RecordLogItem;
    protected reviewState(grade: Grade): RecordLogItem;
    /**
     * Review next_ds
     */
    private next_ds;
    /**
     * Review next_interval
     */
    private next_interval;
    /**
     * Review next_state
     */
    private next_state;
}
