import type { DateInput, Grade } from './models';
import { Rating, type State } from './models';
import type { int, unit } from './types';
declare global {
    export interface Date {
        /**
         * @deprecated This method will be removed in version 6.0.0.
         *
         */
        scheduler(t: int, isDay?: boolean): Date;
        /**
         * @deprecated This method will be removed in version 6.0.0.
         *
         */
        diff(pre: Date, unit: unit): int;
        /**
         * @deprecated This method will be removed in version 6.0.0.
         *
         */
        format(): string;
        /**
         * @deprecated This method will be removed in version 6.0.0.
         *
         */
        dueFormat(last_review: Date, unit?: boolean, timeUnit?: string[]): string;
    }
}
/**
 * 计算日期和时间的偏移，并返回一个新的日期对象。
 * @param now 当前日期和时间
 * @param t 时间偏移量，当 isDay 为 true 时表示天数，为 false 时表示分钟
 * @param isDay （可选）是否按天数单位进行偏移，默认为 false，表示按分钟单位计算偏移
 * @returns 偏移后的日期和时间对象
 */
export declare function date_scheduler(now: DateInput, t: number, isDay?: boolean): Date;
export declare function date_diff(now: DateInput, pre: DateInput, unit: unit): number;
export declare function formatDate(dateInput: DateInput): string;
export declare function show_diff_message(due: DateInput, last_review: DateInput, unit?: boolean, timeUnit?: string[]): string;
/**
 *
 * @deprecated Use TypeConvert.time instead
 * @deprecated This function will be removed in version 6.0.0.
 */
export declare function fixDate(value: unknown): Date;
/**
 * @deprecated Use TypeConvert.state instead
 * @deprecated This function will be removed in version 6.0.0.
 */
export declare function fixState(value: unknown): State;
/**
 * @deprecated Use TypeConvert.rating instead
 * @deprecated This function will be removed in version 6.0.0.
 */
export declare function fixRating(value: unknown): Rating;
export declare const Grades: Readonly<Grade[]>;
export declare function get_fuzz_range(interval: number, elapsed_days: number, maximum_interval: number): {
    min_ivl: number;
    max_ivl: number;
};
export declare function clamp(value: number, min: number, max: number): number;
export declare function roundTo(num: number, decimals: number): number;
export declare function dateDiffInDays(last: Date, cur: Date): number;
