import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("meal upgrade migration enforces relations and keeps order snapshots independent", async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE TABLE products (id text PRIMARY KEY);
            CREATE TABLE order_items (id text PRIMARY KEY);
            INSERT INTO products VALUES ('main'), ('side');
            INSERT INTO order_items VALUES ('existing'), ('new');
        `);
        const migration = await readFile("migrations/20261107_meal_upgrades.sql", "utf8");
        await db.exec(migration);
        await db.exec(migration);
        await db.exec(`
            INSERT INTO meal_upgrades (id, name, price) VALUES ('meal', 'Meal', 250);
            INSERT INTO meal_upgrade_mains VALUES ('meal', 'main');
            INSERT INTO meal_upgrade_groups (id, meal_upgrade_id, name) VALUES ('side-group', 'meal', 'Side');
            INSERT INTO meal_upgrade_choices (id, group_id, product_id) VALUES ('side-choice', 'side-group', 'side');
            UPDATE order_items SET meal_upgrade = '{"name":"Meal","price":250,"choices":[{"product_name":"Side","surcharge":0}]}' WHERE id = 'new';
        `);
        await assert.rejects(db.exec("INSERT INTO meal_upgrade_choices (id, group_id, product_id) VALUES ('duplicate', 'side-group', 'side')"));
        await assert.rejects(db.exec("INSERT INTO meal_upgrade_mains VALUES ('meal', 'missing')"));
        await assert.rejects(db.exec("INSERT INTO meal_upgrade_groups (id, meal_upgrade_id, name, min_selections, max_selections) VALUES ('bad', 'meal', 'Bad', 2, 1)"));
        await assert.rejects(db.exec("INSERT INTO meal_upgrade_choices (id, group_id, product_id, surcharge) VALUES ('bad', 'side-group', 'main', -1)"));
        await db.exec("DELETE FROM meal_upgrades WHERE id = 'meal'");
        const rows = await db.query<{ id: string; meal_upgrade: { name: string } | null }>("SELECT id, meal_upgrade FROM order_items ORDER BY id");
        assert.equal(rows.rows[0]?.meal_upgrade, null);
        assert.equal(rows.rows[1]?.meal_upgrade?.name, "Meal");
    } finally {
        await db.close();
    }
});
