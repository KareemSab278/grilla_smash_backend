import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import { PGlite } from "@electric-sql/pglite";
import { ANALYTICS } from "../src/queries/ANALYTICS";
import type { AnalyticsStore } from "../src/requestHandlers/analytics";

const db = new PGlite();
const day = ["b1", "2026-03-29", "2026-03-29"];

type Amounts = { order_count: number; subtotal: number; discount: number; delivery_fee: number; total: number };
type Sales = {
    summary: Amounts & { average_order_value: number };
    days: (Amounts & { day: string; average_order_value: number })[];
};
type Orders = {
    by_status: { status: string; order_count: number }[];
    by_type: { order_type: string; order_count: number }[];
};
type Refunds = {
    date_basis: string; value_basis: string; summary: { refund_count: number; total: number };
    refunds: { day: string; refund_count: number; total: number }[];
};
type Hour = { hour: number; order_count: number };
type Peaks = {
    by_weekday: { weekday: number; order_count: number }[];
    by_hour: Hour[];
    heatmap: { weekday: number; hour: number; order_count: number }[];
    by_month: { month: string; order_count: number; by_hour: Hour[] }[];
};
type Item = { id: string; name: string; active: boolean; quantity: number; item_value: number };
type Products = { products: Item[]; categories: Item[] };

before(async () => {
    await db.exec(`
        CREATE TABLE branches (id text primary key, name text);
        CREATE TABLE orders (
            id text primary key, branch_id text, created_at timestamptz, status text,
            order_type text, subtotal integer, discount integer, delivery_fee integer, total integer
        );
        CREATE TABLE products (id text primary key, name text, active boolean);
        CREATE TABLE categories (id text primary key, name text, active boolean);
        CREATE TABLE product_categories (product_id text, category_id text);
        CREATE TABLE order_items (id text primary key, order_id text, product_id text, quantity integer, total integer);
        INSERT INTO branches VALUES ('b1','Branch 1'),('b2','Branch 2'),('b3','Branch 3');
        INSERT INTO products VALUES ('p1','Burger',true),('p2','Fries',false);
        INSERT INTO categories VALUES ('c1','Food',true),('c2','Specials',true),('c3','Empty',false);
        INSERT INTO product_categories VALUES ('p1','c1'),('p2','c1'),('p1','c2');
        INSERT INTO orders VALUES
          ('o1','b1','2026-03-29 00:30+00','COMPLETED','DELIVERY',1100,200,100,1000),
          ('o2','b1','2026-03-29 01:30+00','COMPLETED - refund £1.00','PICKUP',400,0,0,400),
          ('o3','b1','2026-03-29 03:30+00','CANCELLED','PICKUP',9999,0,0,9999),
          ('o4','b2','2026-03-29 01:30+00','COMPLETED','DELIVERY',500,0,0,500),
          ('o5','b1','2026-03-28 23:30+00','COMPLETED','PICKUP',9000,0,0,9000),
          ('o6','b1','2026-04-01 11:00+00','COMPLETED','PICKUP',201,0,0,201),
          ('o7','b1','2026-03-29 05:00+00','REFUNDED','PICKUP',777,0,0,777),
          ('o8','b1','2026-03-30 05:00+00','REFUNDED','PICKUP',101,0,0,101),
          ('o9','b1','2026-03-29 06:00+00','PREPARING - refund £4.00','PICKUP',600,0,0,600),
          ('o10','b1','2026-03-29 23:30+00','COMPLETED','PICKUP',300,0,0,300),
          ('o11','b2','2026-03-29 10:00+00','REFUNDED','PICKUP',200,0,0,200),
          ('o12','b3','2026-02-01 10:00+00','COMPLETED','PICKUP',1,0,0,1),
          ('o13','b3','2026-02-01 11:00+00','COMPLETED','PICKUP',2,0,0,2);
        INSERT INTO order_items VALUES
          ('i1','o1','p1',2,1100),('i2','o2','p1',1,400),
          ('i3','o3','p1',10,9999),('i4','o4','p2',1,500);
    `);
});

after(async () => { await db.close(); });

test("sales SQL returns daily and summary totals, rounding, empty data and London date bounds", async () => {
    const { rows } = await db.query<Sales>(ANALYTICS.SALES, day);
    assert.deepEqual(rows[0], {
        summary: { order_count: 2, subtotal: 1500, discount: 200, delivery_fee: 100, total: 1400, average_order_value: 700 },
        days: [{ day: "2026-03-29", order_count: 2, subtotal: 1500, discount: 200, delivery_fee: 100, total: 1400, average_order_value: 700 }],
    });
    const monthly = await db.query<Sales>(ANALYTICS.SALES, ["b1", "2026-03-29", "2026-04-01"]);
    assert.equal(monthly.rows[0]?.summary.total, 1901);
    assert.equal(monthly.rows[0]?.summary.average_order_value, 475);
    assert.deepEqual(monthly.rows[0]?.days.map(row => row.day), ["2026-03-29", "2026-03-30", "2026-04-01"]);
    const all = await db.query<Sales>(ANALYTICS.SALES, [null, "2026-03-29", "2026-03-29"]);
    assert.equal(all.rows[0]?.summary.total, 1900);
    const empty = await db.query<Sales>(ANALYTICS.SALES, ["b1", "2026-01-01", "2026-01-01"]);
    assert.deepEqual(empty.rows[0], {
        summary: { order_count: 0, subtotal: 0, discount: 0, delivery_fee: 0, total: 0, average_order_value: 0 },
        days: [],
    });
    const half = await db.query<Sales>(ANALYTICS.SALES, ["b3", "2026-02-01", "2026-02-01"]);
    assert.equal(half.rows[0]?.summary.average_order_value, 2);
    assert.equal(half.rows[0]?.days[0]?.average_order_value, 2);
});

test("order SQL returns status and completed-only type counts, including zero types", async () => {
    const { rows } = await db.query<Orders>(ANALYTICS.ORDERS, day);
    assert.deepEqual(rows[0], {
        by_status: [
            { status: "CANCELLED", order_count: 1 },
            { status: "COMPLETED", order_count: 1 },
            { status: "COMPLETED (PARTIAL REFUND)", order_count: 1 },
            { status: "PREPARING (PARTIAL REFUND)", order_count: 1 },
            { status: "REFUNDED", order_count: 1 },
        ],
        by_type: [{ order_type: "PICKUP", order_count: 1 }, { order_type: "DELIVERY", order_count: 1 }],
    });
    const empty = await db.query<Orders>(ANALYTICS.ORDERS, ["b1", "2026-01-01", "2026-01-01"]);
    assert.deepEqual(empty.rows[0], {
        by_status: [],
        by_type: [{ order_type: "PICKUP", order_count: 0 }, { order_type: "DELIVERY", order_count: 0 }],
    });
});

test("refund SQL counts only currently refunded orders by order date and original value", async () => {
    const { rows } = await db.query<Refunds>(ANALYTICS.REFUNDS, ["b1", "2026-03-29", "2026-03-30"]);
    assert.deepEqual(rows[0], {
        date_basis: "order_created", value_basis: "order_total",
        summary: { refund_count: 2, total: 878 },
        refunds: [
            { day: "2026-03-29", refund_count: 1, total: 777 },
            { day: "2026-03-30", refund_count: 1, total: 101 },
        ],
    });
    const all = await db.query<Refunds>(ANALYTICS.REFUNDS, [null, "2026-03-29", "2026-03-29"]);
    assert.deepEqual(all.rows[0]?.summary, { refund_count: 2, total: 977 });
    const empty = await db.query<Refunds>(ANALYTICS.REFUNDS, ["b1", "2026-01-01", "2026-01-01"]);
    assert.deepEqual(empty.rows[0]?.summary, { refund_count: 0, total: 0 });
    assert.deepEqual(empty.rows[0]?.refunds, []);
});

test("peak SQL preserves heatmap, hourly and monthly counts over daylight-saving change", async () => {
    const { rows } = await db.query<Peaks>(ANALYTICS.PEAKS, ["b1", "2026-03-29", "2026-04-01"]);
    const report = rows[0];
    assert.ok(report);
    assert.equal(report.by_weekday.length, 7);
    assert.equal(report.by_hour.length, 24);
    assert.equal(report.heatmap.length, 168);
    assert.deepEqual(report.by_hour[0], { hour: 0, order_count: 2 });
    assert.deepEqual(report.by_hour[1], { hour: 1, order_count: 0 });
    assert.deepEqual(report.by_hour[2], { hour: 2, order_count: 1 });
    assert.deepEqual(report.by_hour[12], { hour: 12, order_count: 1 });
    assert.deepEqual(report.by_weekday[6], { weekday: 7, order_count: 2 });
    assert.deepEqual(report.by_month.map(row => [row.month, row.order_count]), [["2026-03", 3], ["2026-04", 1]]);
    assert.equal(report.by_month[1]?.by_hour.length, 24);
    assert.deepEqual(report.by_month[1]?.by_hour[12], { hour: 12, order_count: 1 });
    const empty = await db.query<Peaks>(ANALYTICS.PEAKS, ["b1", "2026-01-01", "2026-01-01"]);
    assert.equal(empty.rows[0]?.heatmap.length, 168);
    assert.ok(empty.rows[0]?.heatmap.every(row => row.order_count === 0));
    assert.deepEqual(empty.rows[0]?.by_month, []);
});

test("product SQL aggregates once and returns zero-sale and overlapping categories", async () => {
    const { rows } = await db.query<Products>(ANALYTICS.PRODUCTS, day);
    assert.deepEqual(rows[0], {
        products: [
            { id: "p1", name: "Burger", active: true, quantity: 3, item_value: 1500 },
            { id: "p2", name: "Fries", active: false, quantity: 0, item_value: 0 },
        ],
        categories: [
            { id: "c3", name: "Empty", active: false, quantity: 0, item_value: 0 },
            { id: "c1", name: "Food", active: true, quantity: 3, item_value: 1500 },
            { id: "c2", name: "Specials", active: true, quantity: 3, item_value: 1500 },
        ],
    });
    const all = await db.query<Products>(ANALYTICS.PRODUCTS, [null, "2026-03-29", "2026-03-29"]);
    assert.equal(all.rows[0]?.products[1]?.quantity, 1);
    assert.equal(all.rows[0]?.categories[1]?.item_value, 2000);
    const empty = await db.query<Products>(ANALYTICS.PRODUCTS, ["b1", "2026-01-01", "2026-01-01"]);
    assert.ok(empty.rows[0]?.products.every(row => row.quantity === 0 && row.item_value === 0));
    assert.ok(empty.rows[0]?.categories.every(row => row.quantity === 0 && row.item_value === 0));
});

test("HTTP analytics routes return SQL reports and share branch and alias caches", async () => {
    process.env.SUPABASE_DB_URL = "postgres://test:test@127.0.0.1:5432/test";
    process.env.STRIPE_SECRET_TEST_KEY = "test";
    process.env.RESEND_API_KEY = "test";
    const { createAnalyticsRouter } = await import("../src/requestHandlers/analytics.js");
    const { errorHandler } = await import("../src/middleware/errorHandler.js");
    const { closeDb } = await import("../src/database/db.js");
    const calls: string[] = [];
    const store: AnalyticsStore = {
        async all<T extends object>(query: string, params = []): Promise<T[]> {
            calls.push(query);
            return (await db.query<T>(query, [...params])).rows;
        },
    };
    const app = express();
    app.use(createAnalyticsRouter(store, (req, res, next) => {
        if (req.header("x-business-key") !== "test-key") {
            res.status(401).json({ detail: "Unauthorized" });
            return;
        }
        next();
    }));
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const dates = "?from=2026-03-29&to=2026-03-29";
    const request = (path: string, key = "test-key") =>
        fetch(`${base}${path}`, { headers: { "x-business-key": key } });
    try {
        assert.equal((await request(`/analytics/sales/b1${dates}`, "bad")).status, 401);
        const [sales, orders, refunds, peaks, products, categories] = await Promise.all([
            request(`/analytics/sales/b1${dates}`),
            request(`/analytics/orders/b1${dates}`),
            request(`/analytics/refunds/b1${dates}`),
            request(`/analytics/peak-times/b1${dates}`),
            request(`/analytics/products/b1${dates}`),
            request(`/analytics/categories/b1${dates}`),
        ]);
        for (const response of [sales, orders, refunds, peaks, products, categories]) {
            assert.equal(response.status, 200);
            assert.equal(response.headers.get("cache-control"), "private, no-store");
        }
        const salesBody: unknown = await sales.json();
        assert.ok(salesBody && typeof salesBody === "object" && "summary" in salesBody);
        assert.deepEqual(salesBody.summary, {
            order_count: 2, subtotal: 1500, discount: 200, delivery_fee: 100, total: 1400, average_order_value: 700,
        });
        const productsBody: unknown = await products.json();
        assert.deepEqual(await categories.json(), productsBody);
        assert.equal(calls.filter(query => query === ANALYTICS.BRANCH_EXISTS).length, 1);
        assert.equal(calls.filter(query => query === ANALYTICS.PRODUCTS).length, 1);
        const beforeRepeat = calls.length;
        assert.equal((await request(`/analytics/sales/b1${dates}`)).status, 200);
        assert.equal(calls.length, beforeRepeat);
        assert.equal((await request(`/analytics/sales/missing${dates}`)).status, 404);
        assert.equal((await request("/analytics/sales/b1?from=2026-03-29")).status, 422);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await closeDb();
    }
});

test("selective branch report plans use the date index without repeating the order scan", async () => {
    await db.exec(`
        CREATE INDEX idx_analytics_orders_branch_created ON orders (branch_id, created_at);
        CREATE INDEX idx_analytics_order_items_order ON order_items (order_id);
        INSERT INTO orders
        SELECT 'bulk' || n, 'b2', '2026-03-29 12:00+00'::timestamptz, 'COMPLETED',
               'PICKUP', 1000, 0, 0, 1000 FROM generate_series(1, 20000) n;
        ANALYZE orders;
        ANALYZE order_items;
    `);
    for (const query of [ANALYTICS.SALES, ANALYTICS.ORDERS, ANALYTICS.REFUNDS, ANALYTICS.PEAKS, ANALYTICS.PRODUCTS]) {
        const plan = await db.query<{ "QUERY PLAN": string }>(`EXPLAIN ${query}`, day);
        const text = plan.rows.map(row => row["QUERY PLAN"]).join("\n");
        assert.equal((text.match(/idx_analytics_orders_branch_created/g) ?? []).length, 1, text);
    }
});
