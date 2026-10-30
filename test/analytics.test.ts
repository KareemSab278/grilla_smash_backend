import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsCache, analyticsRange } from "../src/analytics/analytics";

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

test("analytics ranges accept the inclusive one-day and 366-day boundaries", () => {
    assert.deepEqual(analyticsRange({ from: "2024-02-29", to: "2024-02-29" }), {
        from: "2024-02-29", to: "2024-02-29",
    });
    assert.deepEqual(analyticsRange({ from: "2024-01-01", to: "2024-12-31" }), {
        from: "2024-01-01", to: "2024-12-31",
    });
    assert.throws(() => analyticsRange({ from: "2023-01-01", to: "2024-01-02" }), { status: 422 });
    assert.throws(() => analyticsRange({ from: "2023-02-29", to: "2023-03-01" }), { status: 422 });
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

test("cache refreshes least-recently-used entries and preserves pending coalescing", async () => {
    const cache = new AnalyticsCache<number>(1000, 2);
    let calls = 0;
    let resolveLoad: ((value: number) => void) | undefined;
    const pending = new Promise<number>(resolve => { resolveLoad = resolve; });

    const first = cache.get("a", () => pending);
    assert.equal(cache.get("a", () => Promise.resolve(++calls)), first);
    resolveLoad?.(1);
    assert.equal(await first, 1);

    await cache.get("b", async () => ++calls);
    await cache.get("a", async () => ++calls);
    await cache.get("c", async () => ++calls);
    assert.equal(await cache.get("b", async () => ++calls), 3);
});
