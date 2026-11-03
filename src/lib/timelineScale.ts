/**
 * The time scale behind a Timeline: which columns the grid has, where a date
 * lands on it, and how a bar for a start–end pair is cut to fit.
 *
 * Pure date maths with no React in it, shared by the board's Timeline view and
 * the dashboard's Timeline widget so the two always draw the same bar for the
 * same dates.
 */
import {
    addDays, addYears, subYears, startOfMonth, startOfYear, endOfMonth, endOfYear,
    eachDayOfInterval, eachMonthOfInterval, eachYearOfInterval,
    isSameDay, isSameMonth, isSameYear, getDate, getDaysInMonth, getDayOfYear, getDaysInYear
} from 'date-fns';

export type TimelineViewType = 'day' | 'month' | 'year';

// Day view shows this many days from the 1st of the anchor month, rather than
// stopping at the 30th/31st — a drag or a cascaded dependency shift needs room
// past the month boundary to actually be visible without switching months.
export const DAY_VIEW_SPAN = 45;

// A one-day bar is only ~2.7px wide at month zoom and ~0.3px at year zoom.
// Floor it so short items stay visible and clickable instead of vanishing.
export const MIN_BAR_WIDTH = 22;

export const unitWidthFor = (viewType: TimelineViewType): number =>
    viewType === 'day' ? 40 : viewType === 'month' ? 80 : 120;

export const buildTimeGrid = (viewDate: Date, viewType: TimelineViewType): Date[] => {
    if (viewType === 'day') {
        const start = startOfMonth(viewDate);
        // 45 days instead of just the calendar month, so a dependency shift
        // (or any drag) has enough room past the 30/31-day month boundary to
        // actually be visible without switching months.
        const end = addDays(start, DAY_VIEW_SPAN - 1);
        return eachDayOfInterval({ start, end });
    }
    if (viewType === 'month') {
        return eachMonthOfInterval({ start: startOfYear(viewDate), end: endOfYear(viewDate) });
    }
    return eachYearOfInterval({ start: subYears(viewDate, 2), end: addYears(viewDate, 2) });
};

const isInUnit = (viewType: TimelineViewType, unit: Date, date: Date) =>
    viewType === 'day' ? isSameDay(unit, date) : viewType === 'month' ? isSameMonth(unit, date) : isSameYear(unit, date);

export interface BarSpan {
    left: number;
    width: number;
    // True when the real start/end falls outside the visible window, so the
    // rendered edge is the window's edge rather than the item's date.
    clippedStart: boolean;
    clippedEnd: boolean;
}

/**
 * Where a bar sits on the grid, or null when its dates fall wholly outside the
 * window.
 */
export const computeBarSpan = (
    startDate: Date,
    endDate: Date,
    timeGrid: Date[],
    viewType: TimelineViewType,
    unitWidth: number
): BarSpan | null => {
    const lastUnit = timeGrid[timeGrid.length - 1];
    const windowStart = timeGrid[0];
    const windowEnd = viewType === 'day' ? lastUnit
        : viewType === 'month' ? endOfMonth(lastUnit)
            : endOfYear(lastUnit);

    // Where a day sits, measured in columns from the left edge of the grid.
    // The whole part is which column it falls in, the fraction how far
    // through it — which is what lets a bar begin and end partway along a
    // month or a year rather than on a column boundary.
    const columnOffset = (date: Date): number | null => {
        if (viewType === 'day') {
            const i = timeGrid.findIndex(u => isSameDay(u, date));
            return i === -1 ? null : i;
        }
        if (viewType === 'month') {
            const i = timeGrid.findIndex(u => isSameMonth(u, date));
            return i === -1 ? null : i + (getDate(date) - 1) / getDaysInMonth(date);
        }
        const i = timeGrid.findIndex(u => isSameYear(u, date));
        return i === -1 ? null : i + (getDayOfYear(date) - 1) / getDaysInYear(date);
    };

    // How much of one column a single day takes up at this zoom, so an
    // end date can be drawn inclusive of the whole day.
    const dayWidthInColumns = (date: Date): number => {
        if (viewType === 'day') return 1;
        if (viewType === 'month') return 1 / getDaysInMonth(date);
        return 1 / getDaysInYear(date);
    };

    // Drop anything wholly outside the window. Compared against the last
    // unit's *end*, not its start — in Month view the final grid entry is
    // December 1st, so measuring from there hid every bar starting later
    // in December whose end ran past the year.
    if (endDate < windowStart || startDate > windowEnd) return null;

    const clippedStart = startDate < windowStart;
    const clippedEnd = endDate > windowEnd;

    // Measured in columns, fraction included: a month column covers ~30
    // days, so a 15-day bar has to be half of one. Snapping each edge to
    // a whole column instead made every bar shorter than its column fill
    // the entire thing, reading as a month-long task.
    const from = clippedStart ? 0 : columnOffset(startDate) ?? 0;
    const to = clippedEnd
        ? timeGrid.length
        : (columnOffset(endDate) ?? timeGrid.length) + dayWidthInColumns(endDate);

    return {
        left: from * unitWidth,
        // A single day is ~2.7px wide at month zoom, so it needs a floor to
        // stay visible and clickable at all.
        width: Math.max(MIN_BAR_WIDTH, (to - from) * unitWidth),
        clippedStart,
        clippedEnd
    };
};

/** Where the "today" line goes, in px from the left edge of the grid; null when today is off-grid. */
export const todayOffset = (timeGrid: Date[], viewType: TimelineViewType, unitWidth: number, today: Date = new Date()): number | null => {
    const startIndex = timeGrid.findIndex(u => isInUnit(viewType, u, today));
    if (startIndex === -1) return null;

    return startIndex * unitWidth + (viewType === 'day' ? 0
        : viewType === 'month' ? (today.getDate() / endOfMonth(today).getDate()) * unitWidth
            : (today.getMonth() / 12) * unitWidth);
};

/** Whether `unit` is the column that contains today (for highlighting its header). */
export const isCurrentUnit = (viewType: TimelineViewType, unit: Date, today: Date = new Date()): boolean =>
    isInUnit(viewType, unit, today);
