import { AbstractScheduler } from '../abstract_scheduler';
import { type Grade, type RecordLogItem } from '../models';
export default class LongTermScheduler extends AbstractScheduler {
    protected newState(grade: Grade): RecordLogItem;
    private next_ds;
    /**
     * @see https://github.com/open-spaced-repetition/ts-fsrs/issues/98#issuecomment-2241923194
     */
    protected learningState(grade: Grade): RecordLogItem;
    protected reviewState(grade: Grade): RecordLogItem;
    /**
     * Review/New next_interval
     */
    private next_interval;
    /**
     * Review/New next_state
     */
    private next_state;
    private update_next;
}
