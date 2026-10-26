import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsCache, analyticsRange, categorySales, peakSeries, refundedOrderSeries } from "../src/analytics/analytics";

test("analytics ranges default to London year to date, including around New Year", () => {
    assert.deepEqual(analyticsRange({}, new Date("2026-12-31T23:30:00Z")), {
        from: "2026-01-01", to: "2026-12-31",
    });
    assert.deepEqual(analyticsRange({}, new Date("2026-12-31T00:30:00Z")), {
        from: "2026-01-01", to: "2026-12-31",
    });
    assert.deepEqual(analyticsRange({}, new Date("2026-06-30T23:30:00Z")), {
        from: "2026-01-01", to: "2026-07-01",
    });
});

test("analytics ranges accept one leap year and reject invalid, partial or oversized ranges", () => {
    assert.deepEqual(analyticsRange({ from: "2024-01-01", to: "2024-12-31" }), {
        from: "2024-01-01", to: "2024-12-31",
    });
    for (const input of [
        { from: "2024-01-01" },
        { from: "2024-02-30", to: "2024-03-01" },
        { from: "2024-12-31", to: "2024-01-01" },
        { from: "2024-01-01", to: "2025-01-01" },
        { from: "2024-01-01", to: "2024-01-02", extra: "x" },
        { from: ["2024-01-01"], to: "2024-01-02" },
    ]) assert.throws(() => analyticsRange(input), { status: 422 });
});

test("category sales include zero-sale categories and count products in every current category", () => {
    const products = [
        { id: "p1", name: "Burger", active: true, quantity: 2, item_value: 1500 },
        { id: "p2", name: "Side", active: false, quantity: 0, item_value: 0 },
    ];
    const categories = categorySales(products, [
        { id: "c1", name: "Food", active: true, product_id: "p1" },
        { id: "c1", name: "Food", active: true, product_id: "p2" },
        { id: "c2", name: "Specials", active: true, product_id: "p1" },
        { id: "c3", name: "Empty", active: false, product_id: null },
    ]);
    assert.deepEqual(categories.map(({ id, quantity, item_value }) => ({ id, quantity, item_value })), [
        { id: "c1", quantity: 2, item_value: 1500 },
        { id: "c2", quantity: 2, item_value: 1500 },
        { id: "c3", quantity: 0, item_value: 0 },
    ]);
});

test("refunded order series sums order counts and original order values, including empty periods", () => {
    assert.deepEqual(refundedOrderSeries([]), {
        date_basis: "order_created", value_basis: "order_total",
        summary: { refund_count: 0, total: 0 }, refunds: [],
    });
    const rows = [
        { day: "2026-01-10", refund_count: 2, total: 2500 },
        { day: "2026-01-20", refund_count: 1, total: 1000 },
    ];
    assert.deepEqual(refundedOrderSeries(rows), {
        date_basis: "order_created", value_basis: "order_total",
        summary: { refund_count: 3, total: 3500 }, refunds: rows,
    });
});

test("peak series fill all 168 weekday-hour buckets and calculate the two totals", () => {
    const result = peakSeries([
        { month: "2026-01", weekday: 1, hour: 12, order_count: 3 },
        { month: "2026-01", weekday: 7, hour: 12, order_count: 2 },
        { month: "2026-02", weekday: 1, hour: 13, order_count: 4 },
        { month: "2026-02", weekday: 1, hour: 12, order_count: 1 },
    ]);
    assert.equal(result.heatmap.length, 168);
    assert.equal(result.by_weekday[0]?.order_count, 8);
    assert.equal(result.by_weekday[6]?.order_count, 2);
    assert.equal(result.by_hour[12]?.order_count, 6);
    assert.equal(result.by_hour[13]?.order_count, 4);
    assert.deepEqual(result.heatmap[0], { weekday: 1, hour: 0, order_count: 0 });
    assert.equal(result.by_month[0]?.order_count, 5);
    assert.equal(result.by_month[1]?.by_hour[12]?.order_count, 1);
});

test("cache coalesces requests, expires, evicts, and does not cache errors", async () => {
    const cache = new AnalyticsCache<number>(50, 1);
    let calls = 0;
    const load = async () => ++calls;
    const now = Date.now();
    const first = cache.get("a", load, now);
    const concurrent = cache.get("a", load, now);
    assert.equal(first, concurrent);
    assert.equal(await first, 1);
    assert.equal(await cache.get("a", load, Date.now()), 1);
    assert.equal(await cache.get("a", load, Date.now() + 51), 2);
    assert.equal(await cache.get("b", load), 3);
    assert.equal(await cache.get("a", load), 4);
    await assert.rejects(cache.get("error", async () => { throw new Error("DB unavailable"); }));
    assert.equal(await cache.get("error", load), 5);
});
