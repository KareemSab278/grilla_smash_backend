/*
    Each branch’s JSON opening hours are checked independently in Europe/London;
    after PURGE_INTERVAL_HRS, it purges at the next closed time.
    If that time is more than 12 hours away, it purges immediately.
    The scheduler checks every 12 hours, and an eligible purge runs on startup.
*/

import { CONFIG } from "./config";
import { dbAll } from "./database/db";
import sql from "./database/db";
import { QUERIES } from "./queries/queries";
import type { DayOfWeek, OpeningHours } from "./types";

const BUSINESS_TIME_ZONE = "Europe/London";
const CHECK_INTERVAL_MS = 60 * 60 * 1000 * 12; // 12 hours
const MAX_WAIT_FOR_CLOSED_HOURS_MS = 12 * 60 * 60 * 1000;
const DAY_ORDER: readonly DayOfWeek[] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
];

type BranchPurgeHours = {
    id: string;
    opening_hours: OpeningHours | string;
};

const localTimeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const lastPurgeAtByBranch = new Map<string, number>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const isOpeningHours = (value: unknown): value is OpeningHours =>
    isRecord(value) &&
    DAY_ORDER.every(day => {
        const hours = value[day];
        return isRecord(hours) &&
            typeof hours.open === "string" &&
            typeof hours.close === "string" &&
            (hours.is_closed === undefined || typeof hours.is_closed === "boolean");
    });

const parseOpeningHours = (value: OpeningHours | string, branchId: string): OpeningHours => {
    let parsed: unknown = value;
    for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt++) {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            throw new Error(`Invalid opening hours JSON for branch ${branchId}`, { cause: error });
        }
    }

    if (!isOpeningHours(parsed)) {
        throw new Error(`Invalid opening hours structure for branch ${branchId}`);
    }

    return parsed;
};

const parseMinutes = (time: string, branchId: string, day: DayOfWeek, label: string): number => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    if (!match) {
        throw new Error(`Invalid ${label} time for branch ${branchId} on ${day}: ${time}`);
    }

    return Number(match[1]) * 60 + Number(match[2]);
};

const shouldPurgeBranch = (branch: BranchPurgeHours, now: Date, intervalMs: number): boolean => {
    const lastPurgeAt = lastPurgeAtByBranch.get(branch.id) ?? 0;
    if (now.getTime() - lastPurgeAt < intervalMs) return false;

    const parts = Object.fromEntries(localTimeFormatter.formatToParts(now).map(part => [part.type, part.value]));
    const day = DAY_ORDER.find(candidate => candidate === parts.weekday?.toLowerCase());
    if (!day) {
        throw new Error(`Could not determine London weekday for customer-data purge (branch ${branch.id})`);
    }

    const hours = parseOpeningHours(branch.opening_hours, branch.id)[day];
    if (hours.is_closed) return true;

    const openingMinute = parseMinutes(hours.open, branch.id, day, "opening");
    const closingMinute = parseMinutes(hours.close, branch.id, day, "closing");
    if (openingMinute >= closingMinute) {
        throw new Error(`Invalid opening hours for branch ${branch.id} on ${day}: open must be before close`);
    }

    const currentMinute = Number(parts.hour) * 60 + Number(parts.minute);
    if (currentMinute < openingMinute || currentMinute >= closingMinute) return true;

    const minutesUntilClose = closingMinute - currentMinute;
    return minutesUntilClose * 60 * 1000 > MAX_WAIT_FOR_CLOSED_HOURS_MS;
};

const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const runDuePurges = async (): Promise<void> => {
    const now = new Date();
    const branches = await dbAll<BranchPurgeHours>(sql, QUERIES.GET.BRANCH_PURGE_HOURS);
    const intervalMs = CONFIG.purgeIntervalHrs * 60 * 60 * 1000;
    const dueBranchIds = branches
        .filter(branch => shouldPurgeBranch(branch, now, intervalMs))
        .map(branch => branch.id);

    if (dueBranchIds.length === 0) {
        console.log("No branches due for customer data purge.");
        return;
    }

    const result = await dbAll<{ updated_count: number }>(
        sql,
        QUERIES.PATCH.PURGE_OLD_CUSTOMER_DATA,
        [dueBranchIds]
    );
    const completedAt = Date.now();
    for (const branchId of dueBranchIds) {
        lastPurgeAtByBranch.set(branchId, completedAt);
    }

    console.log(
        `Customer data purge completed for ${dueBranchIds.length} branch(es). Updated ${result[0]?.updated_count ?? 0} order(s).`
    );
};

const startCustomerDataPurgeLoop = async (): Promise<void> => {
    while (true) {
        try {
            await runDuePurges();
        } catch (error) {
            console.error("Customer data purge failed:", error);
        }
        await delay(CHECK_INTERVAL_MS);
    }
};

export default startCustomerDataPurgeLoop;
