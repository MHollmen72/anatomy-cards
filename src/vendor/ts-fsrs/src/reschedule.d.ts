import type { FSRS } from './fsrs';
import { type Card, type CardInput, type DateInput, type FSRSHistory, type Grade, type RecordLogItem, State } from './models';
/**
 * The `Reschedule` class provides methods to handle the rescheduling of cards based on their review history.
 * determine the next review dates and update the card's state accordingly.
 */
export declare class Reschedule {
    private fsrs;
    /**
     * Creates an instance of the `Reschedule` class.
     * @param fsrs - An instance of the FSRS class used for scheduling.
     */
    constructor(fsrs: FSRS);
    /**
     * Replays a review for a card and determines the next review date based on the given rating.
     * @param card - The card being reviewed.
     * @param reviewed - The date the card was reviewed.
     * @param rating - The grade given to the card during the review.
     * @returns A `RecordLogItem` containing the updated card and review log.
     */
    replay(card: Card, reviewed: Date, rating: Grade): RecordLogItem;
    /**
     * Processes a manual review for a card, allowing for custom state, stability, difficulty, and due date.
     * @param card - The card being reviewed.
     * @param state - The state of the card after the review.
     * @param reviewed - The date the card was reviewed.
     * @param elapsed_days - The number of days since the last review.
     * @param stability - (Optional) The stability of the card.
     * @param difficulty - (Optional) The difficulty of the card.
     * @param due - (Optional) The due date for the next review.
     * @returns A `RecordLogItem` containing the updated card and review log.
     * @throws Will throw an error if the state or due date is not provided when required.
     */
    handleManualRating(card: Card, state: State, reviewed: Date, elapsed_days: number, stability?: number, difficulty?: number, due?: Date): RecordLogItem;
    /**
     * Reschedules a card based on its review history.
     *
     * @param current_card - The card to be rescheduled.
     * @param reviews - An array of review history objects.
     * @returns An array of record log items representing the rescheduling process.
     */
    reschedule(current_card: CardInput, reviews: FSRSHistory[]): RecordLogItem[];
    calculateManualRecord(current_card: CardInput, now: DateInput, record_log_item?: RecordLogItem, update_memory?: boolean): RecordLogItem | null;
}
