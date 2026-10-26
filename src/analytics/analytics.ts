import { z } from "zod";
import { parseInput } from "../middleware/validate";
import { unprocessable } from "../helpers/errors";

const dateSchema = z.iso.date().refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

const rangeSchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).strict();

export type AnalyticsRange = { from: string; to: string };

export const analyticsRange = (input: unknown, now = new Date()): AnalyticsRange => {
    const { from, to } = parseInput(rangeSchema, input);
    if ((from === undefined) !== (to === undefined)) throw unprocessable("from and to must be supplied together");

    if (from !== undefined && to !== undefined) {
        const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
        if (days < 0 || days > 365) throw unprocessable("Date range must be between 1 and 366 calendar days");
        return { from, to };
    }

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const year = parts.find(part => part.type === "year")?.value;
    const month = parts.find(part => part.type === "month")?.value;
    const day = parts.find(part => part.type === "day")?.value;
    if (!year || !month || !day) throw new Error("Could not determine the London calendar date");
    return { from: `${year}-01-01`, to: `${year}-${month}-${day}` };
};

type CacheEntry<T> = { value: Promise<T>; expiresAt: number };
export class AnalyticsCache<T> {
    private readonly entries = new Map<string, CacheEntry<T>>();

    constructor(private readonly ttlMs: number, private readonly capacity: number) {}

    get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
        const existing = this.entries.get(key);
        if (existing && existing.expiresAt > now) {
            this.entries.delete(key);
            this.entries.set(key, existing);
            return existing.value;
        }
        this.entries.delete(key);
        const entry: CacheEntry<T> = { value: Promise.resolve().then(load), expiresAt: Infinity };
        this.entries.set(key, entry);
        if (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
        }
        entry.value.then(
            () => { entry.expiresAt = Date.now() + this.ttlMs; },
            () => { if (this.entries.get(key) === entry) this.entries.delete(key); }
        );
        return entry.value;
    }
}
