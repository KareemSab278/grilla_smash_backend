import { z } from "zod";
import { parseInput } from "../middleware/validate";
import { unprocessable } from "../helpers/errors";

const dateSchema = z.iso.date().refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

const rangeSchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).strict();

export type AnalyticsRange = { from: string; to: string };

export type RefundedOrderDay = { day: string; refund_count: number; total: number };
export const refundedOrderSeries = (rows: readonly RefundedOrderDay[]) => ({
    date_basis: "order_created",
    value_basis: "order_total",
    summary: rows.reduce(
        (sum, row) => ({ refund_count: sum.refund_count + row.refund_count, total: sum.total + row.total }),
        { refund_count: 0, total: 0 }
    ),
    refunds: rows,
});

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

export type ProductSales = {
    id: string; name: string; active: boolean; quantity: number; item_value: number;
};
export type CategoryProduct = { id: string; name: string; active: boolean; product_id: string | null };
export type CategorySales = {
    id: string; name: string; active: boolean; quantity: number; item_value: number;
};

export const categorySales = (products: readonly ProductSales[], rows: readonly CategoryProduct[]): CategorySales[] => {
    const byProduct = new Map(products.map(product => [product.id, product]));
    const categories = new Map<string, CategorySales>();
    for (const row of rows) {
        let category = categories.get(row.id);
        if (!category) {
            category = { id: row.id, name: row.name, active: row.active, quantity: 0, item_value: 0 };
            categories.set(row.id, category);
        }
        const product = row.product_id === null ? undefined : byProduct.get(row.product_id);
        if (product) {
            category.quantity += product.quantity;
            category.item_value += product.item_value;
        }
    }
    return [...categories.values()];
};

export type PeakRow = { month: string; weekday: number; hour: number; order_count: number };
export const peakSeries = (rows: readonly PeakRow[]) => {
    const counts = new Map<string, number>();
    const months = new Map<string, { month: string; order_count: number; by_hour: { hour: number; order_count: number }[] }>();
    for (const row of rows) {
        const key = `${row.weekday}:${row.hour}`;
        counts.set(key, (counts.get(key) ?? 0) + row.order_count);
        let month = months.get(row.month);
        if (!month) {
            month = {
                month: row.month, order_count: 0,
                by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, order_count: 0 })),
            };
            months.set(row.month, month);
        }
        const hour = month.by_hour[row.hour];
        if (!hour) throw new Error(`Invalid analytics hour: ${row.hour}`);
        hour.order_count += row.order_count;
        month.order_count += row.order_count;
    }
    const by_weekday = Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, order_count: 0 }));
    const by_hour = Array.from({ length: 24 }, (_, hour) => ({ hour, order_count: 0 }));
    const heatmap: { weekday: number; hour: number; order_count: number }[] = [];
    for (const day of by_weekday) {
        for (const hour of by_hour) {
            const order_count = counts.get(`${day.weekday}:${hour.hour}`) ?? 0;
            day.order_count += order_count;
            hour.order_count += order_count;
            heatmap.push({ weekday: day.weekday, hour: hour.hour, order_count });
        }
    }
    return { by_weekday, by_hour, heatmap, by_month: [...months.values()] };
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
