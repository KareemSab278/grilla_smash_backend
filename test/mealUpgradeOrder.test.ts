import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { orderCreateSchema } from "../src/database/schemas";
import { QUERIES } from "../src/queries/queries";
import type { Db } from "../src/database/db";

process.env.SUPABASE_DB_URL ??= "postgres://localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

test("meal selections and displayed surcharges are saved on the main order item", async () => {
    assert.match(QUERIES.POST.ORDER_ITEM, /\$12::text::jsonb/);
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE TABLE products (id text PRIMARY KEY, name text, active boolean, price integer,
                ingredients text[], hidden boolean);
            CREATE TABLE branches (id text PRIMARY KEY, unavailable_products text[]);
            CREATE TABLE branch_product_overrides (branch_id text, product_id text, active boolean, price_override integer);
            CREATE TABLE product_modifier_groups (product_id text, modifier_group_id text);
            CREATE TABLE modifier_groups (id text, name text, required boolean, min_selections integer, max_selections integer, active boolean);
            CREATE TABLE modifiers (id text, modifier_group_id text, name text, price integer, active boolean);
            CREATE TABLE order_items (id text PRIMARY KEY, order_id text, product_id text, offer_id text,
                offer_rule_id text, name text, quantity integer, unit_price integer, total integer, notes text,
                removed_ingredients text[]);
            CREATE TABLE order_item_modifiers (id text, order_item_id text, modifier_id text, name text, price integer, quantity integer);
            INSERT INTO products VALUES ('main', 'Wings', true, 300, '{}', false);
            INSERT INTO branches VALUES ('branch', '{}');
            INSERT INTO product_modifier_groups VALUES ('main', 'sauce');
            INSERT INTO modifier_groups VALUES ('sauce', 'Sauce', false, 0, 1, true);
            INSERT INTO modifiers VALUES ('sauce-choice', 'sauce', 'Sauce', 30, true);
        `);
        await db.exec(await readFile("migrations/20261107_meal_upgrades.sql", "utf8"));
        const handle = {
            unsafe: async (query: string, params: unknown[] = []) => (await db.query(query, params)).rows,
        } as unknown as Db;
        const { priceItems, insertItems } = await import("../src/requestHandlers/orders");
        const snapshot = {
            id: "meal", name: "Meal", price: 250,
            choices: [
                { id: "fries-choice", group_id: "side", group_name: "Side", product_id: "fries", product_name: "Fries", surcharge: 0 },
                { id: "cola-choice", group_id: "drink", group_name: "Drink", product_id: "cola", product_name: "Cola", surcharge: 75 },
            ],
        };
        const data = orderCreateSchema.parse({
            branch_id: "branch", customer_name: "Customer",
            items: [
                { product_id: "main", quantity: 2, modifier_ids: ["sauce-choice"], meal_upgrade: snapshot },
                { product_id: "main", quantity: 1 },
            ],
        });
        const priced = await priceItems(handle, data);
        await insertItems(handle, "order", priced);
        const result = await db.query<{
            quantity: number; unit_price: number; total: number; meal_upgrade: typeof snapshot | null;
        }>(QUERIES.GET.ORDER_ITEMS, [["order"]]);
        const upgraded = result.rows.find(row => row.quantity === 2);
        const plain = result.rows.find(row => row.quantity === 1);
        assert.equal(upgraded?.unit_price, 655);
        assert.equal(upgraded?.total, 1310);
        assert.deepEqual(upgraded?.meal_upgrade, snapshot);
        assert.equal(plain?.unit_price, 300);
        assert.equal(plain?.meal_upgrade, null);
        const modifiers = await db.query<{ name: string; price: number }>("SELECT name, price FROM order_item_modifiers");
        assert.deepEqual(modifiers.rows, [{ name: "Sauce", price: 30 }]);

        assert.throws(() => orderCreateSchema.parse({
            branch_id: "branch", customer_name: "Customer",
            items: [{ product_id: "main", quantity: 1, meal_upgrade: { meal_upgrade_id: "meal", choice_ids: ["fries-choice"] } }],
        }));
    } finally {
        await db.close();
    }
});
