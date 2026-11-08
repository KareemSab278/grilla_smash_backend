import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Db } from "../src/database/db";

process.env.SUPABASE_DB_URL ??= "postgres://localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

type Queryable = { query: (query: string, params?: unknown[]) => Promise<{ rows: object[] }> };
const adapter = (db: Queryable): Db => ({
    unsafe: async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows,
}) as unknown as Db;

test("meal upgrade endpoints support admin CRUD and preserve identifiers on edits", async () => {
    const db = new PGlite();
    await db.exec(`
        CREATE TABLE products (id text PRIMARY KEY);
        CREATE TABLE order_items (id text PRIMARY KEY);
        INSERT INTO products VALUES ('burger'), ('fries'), ('cola'), ('premium');
    `);
    await db.exec(await readFile("migrations/20261107_meal_upgrades.sql", "utf8"));
    const { createMealUpgradeRouter } = await import("../src/requestHandlers/mealUpgrades");
    const { errorHandler, notFoundHandler } = await import("../src/middleware/errorHandler");
    const app = express();
    app.use(express.json());
    app.use(createMealUpgradeRouter({
        db: adapter(db),
        transaction: work => db.transaction(tx => work(adapter(tx))),
    }));
    app.use(notFoundHandler);
    app.use(errorHandler);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/meal-upgrades`;
    const request = async (path = "", method = "GET", body?: unknown) => {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        return { status: response.status, body: await response.json() };
    };

    try {
        assert.deepEqual((await request()).body, []);
        const payload = {
            name: "Burger meal", upgrade_price: 350, active: true, sort_order: 2,
            main_product_ids: ["burger"],
            groups: [
                { name: "Side", min_selections: 1, max_selections: 1, sort_order: 0,
                    choices: [{ product_id: "fries", surcharge: 0, sort_order: 0, active: false }] },
                { name: "Drink", min_selections: 1, max_selections: 1, sort_order: 1,
                    choices: [{ product_id: "cola", surcharge: 100, sort_order: 0 }] },
            ],
        };
        const created = await request("", "POST", payload);
        assert.equal(created.status, 200);
        assert.equal(created.body.upgrade_price, 350);
        assert.deepEqual(created.body.main_product_ids, ["burger"]);
        const id: string = created.body.id;
        const side = created.body.groups[0];
        const drink = created.body.groups[1];
        assert.equal(side.choices[0].active, false);
        assert.equal(drink.choices[0].surcharge, 100);
        assert.equal((await request(`/${id}`)).body.name, "Burger meal");

        const update = {
            name: "Updated meal",
            groups: [
                { ...payload.groups[0], id: side.id, choices: [{ product_id: "fries", surcharge: 25, sort_order: 0 }] },
                { ...payload.groups[1], id: drink.id, choices: [
                    { product_id: "cola", surcharge: 150, sort_order: 0 },
                    { product_id: "premium", surcharge: 200, sort_order: 1 },
                ] },
            ],
        };
        const updated = await request(`/${id}`, "PUT", update);
        assert.equal(updated.status, 200);
        assert.equal(updated.body.upgrade_price, 350);
        assert.equal(updated.body.groups[0].id, side.id);
        assert.equal(updated.body.groups[0].choices[0].id, side.choices[0].id);
        assert.equal(updated.body.groups[0].choices[0].active, false);
        assert.equal(updated.body.groups[1].choices[0].id, drink.choices[0].id);
        assert.equal(updated.body.groups[1].choices[1].surcharge, 200);

        const invalid = await request(`/${id}`, "PUT", {
            name: "Must roll back",
            main_product_ids: ["missing"],
        });
        assert.equal(invalid.status, 400);
        assert.equal((await request(`/${id}`)).body.name, "Updated meal");
        assert.equal((await request(`/${id}`, "PUT", {
            groups: [{ ...update.groups[0], id: "another-upgrade-group" }],
        })).status, 400);
        assert.equal((await request("", "POST", {
            ...payload, main_product_ids: ["burger", "burger"],
        })).status, 422);
        assert.equal((await request("", "POST", {
            ...payload, groups: [{ ...payload.groups[0], choices: [
                { product_id: "fries" }, { product_id: "fries" },
            ] }],
        })).status, 422);
        assert.equal((await request("", "POST", {
            ...payload, groups: [{ ...payload.groups[0], min_selections: 2 }],
        })).status, 422);
        assert.equal((await request()).body.length, 1);
        assert.equal((await request(`/${id}`, "DELETE")).status, 200);
        assert.equal((await request(`/${id}`)).status, 404);
        assert.equal((await request(`/${id}`, "DELETE")).status, 404);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await db.close();
    }
});
