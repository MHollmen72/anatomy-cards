export type StateType = 'New' | 'Learning' | 'Review' | 'Relearning';
export declare enum State {
    New = 0,
    Learning = 1,
    Review = 2,
    Relearning = 3
}
export type RatingType = 'Manual' | 'Again' | 'Hard' | 'Good' | 'Easy';
export declare enum Rating {
    Manual = 0,
    Again = 1,
    Hard = 2,
    Good = 3,
    Easy = 4
}
export type GradeType = Exclude<RatingType, 'Manual'>;
export type Grade = Exclude<Rating, Rating.Manual>;
export interface ReviewLog {
    rating: Rating;
    state: State;
    due: Date;
    stability: number;
    difficulty: number;
    /**
     * @deprecated This field will be removed in version 6.0.0
     */
    elapsed_days: number;
    /**
     * @deprecated This field will be removed in version 6.0.0
     */
    last_elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;
    review: Date;
}
export type RecordLogItem = {
    card: Card;
    log: ReviewLog;
};
export type RecordLog = {
    [key in Grade]: RecordLogItem;
};
export interface Card {
    due: Date;
    stability: number;
    difficulty: number;
    /**
     * @deprecated This field will be removed in version 6.0.0
     */
    elapsed_days: number;
    scheduled_days: number;
    learning_steps: number;
    reps: number;
    lapses: number;
    state: State;
    last_review?: Date;
}
export interface CardInput extends Omit<Card, 'state' | 'due' | 'last_review'> {
    state: StateType | State;
    due: DateInput;
    last_review?: DateInput | null;
}
export type DateInput = Date | number | string;
export type TimeUnit = 'm' | 'h' | 'd';
export type StepUnit = `${number}${TimeUnit}`;
/**
 * (re)Learning steps:
 * [1m, 10m]
 * step1:again=1m hard=6m good=10m
 * step2(good): again=1m hard=10m
 *
 * [5m]
 * step1:again=5m hard=8m
 * step2(good): again=5m
 * step2(hard): again=5m hard=7.5m
 *
 * []
 * step: Managed by FSRS
 *
 */
export type Steps = StepUnit[] | readonly StepUnit[];
export interface ReviewLogInput extends Omit<ReviewLog, 'rating' | 'state' | 'due' | 'review'> {
    rating: RatingType | Rating;
    state: StateType | State;
    due: DateInput;
    review: DateInput;
}
export interface FSRSParameters {
    request_retention: number;
    maximum_interval: number;
    w: number[] | readonly number[];
    enable_fuzz: boolean;
    /**
     * When enable_short_term = false, the (re)learning steps are not applied.
     */
    enable_short_term: boolean;
    learning_steps: Steps;
    relearning_steps: Steps;
}
export interface FSRSReview {
    /**
     * 0-4: Manual, Again, Hard, Good, Easy
     * = revlog.rating
     */
    rating: Rating;
    /**
     * The number of days that passed
     * = revlog.elapsed_days
     * = round(revlog[-1].review - revlog[-2].review)
     */
    delta_t: number;
}
export type FSRSHistory = Partial<Omit<ReviewLog, 'rating' | 'review' | 'elapsed_days'>> & ({
    rating: Grade;
    review: DateInput | Date;
} | {
    rating: Rating.Manual;
    due: DateInput | Date;
    state: State;
    review: DateInput | Date;
});
export interface FSRSState {
    stability: number;
    difficulty: number;
}
