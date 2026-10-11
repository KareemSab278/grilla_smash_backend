/*
    BRANCH HOURS HELPERS - shared opening-hours defaults and merge logic.

    The validators live in src/schemas.ts. This file only provides the default schedule and a pure merge
    helper so handlers can update one day without clobbering the rest of the week.
*/

import type { DayHours, DayOfWeek, OpeningHours } from "./types";

const DAY_ORDER: readonly DayOfWeek[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

export const DEFAULT_OPENING_HOURS: OpeningHours = {
    monday: { open: "09:00", close: "17:00", is_closed: false },
    tuesday: { open: "09:00", close: "17:00", is_closed: false },
    wednesday: { open: "09:00", close: "17:00", is_closed: false },
    thursday: { open: "09:00", close: "17:00", is_closed: false },
    friday: { open: "09:00", close: "17:00", is_closed: false },
    saturday: { open: "09:00", close: "17:00", is_closed: false },
    sunday: { open: "09:00", close: "17:00", is_closed: false },
};

export type OpeningHoursPatch = Partial<Record<DayOfWeek, Partial<DayHours>>>;

const mergeDayHours = (current: DayHours, patch?: Partial<DayHours>): DayHours => {
    const hasTimeUpdate = patch?.open !== undefined || patch?.close !== undefined;

    return {
        open: patch?.open ?? current.open,
        close: patch?.close ?? current.close,
        is_closed: patch?.is_closed ?? (hasTimeUpdate ? false : current.is_closed ?? false),
    };
};

export const mergeOpeningHours = (current: OpeningHours, patch: OpeningHoursPatch): OpeningHours => {
    const merged = {} as OpeningHours;

    for (const day of DAY_ORDER) {
        merged[day] = mergeDayHours(current[day], patch[day]);
    }

    return merged;
};
