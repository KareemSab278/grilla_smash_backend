import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PATCH } from "../src/queries/PATCH";

test("customer-data purge scrubs eligible old orders only for selected branches", async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE TABLE orders (
                id text PRIMARY KEY,
                branch_id text NOT NULL,
                status text NOT NULL,
                customer_name text NOT NULL,
                customer_phone text,
                customer_email text,
                address_line1 text,
                address_line2 text,
                city text,
                postcode text,
                notes text,
                created_at timestamptz NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT now()
            );
            INSERT INTO orders (id, branch_id, status, customer_name, customer_phone, address_line1, created_at) VALUES
                ('eligible', 'branch-a', 'COMPLETED', 'Customer', '123', '1 Main St', now() - INTERVAL '80 hours'),
                ('cancelled', 'branch-a', 'CANCELLED', 'Customer', '123', '1 Main St', now() - INTERVAL '80 hours'),
                ('recent', 'branch-a', 'COMPLETED', 'Customer', '123', '1 Main St', now() - INTERVAL '40 hours'),
                ('other-branch', 'branch-b', 'COMPLETED', 'Customer', '123', '1 Main St', now() - INTERVAL '80 hours'),
                ('already-scrubbed', 'branch-a', 'COMPLETED', '-', NULL, NULL, now() - INTERVAL '80 hours');
        `);

        const result = await db.query<{ updated_count: number }>(PATCH.PURGE_OLD_CUSTOMER_DATA, [["branch-a"]]);
        assert.equal(result.rows[0]?.updated_count, 1);

        const rows = await db.query<{
            id: string;
            customer_name: string;
            customer_phone: string | null;
            address_line1: string | null;
        }>("SELECT id, customer_name, customer_phone, address_line1 FROM orders ORDER BY id");
        const eligible = rows.rows.find(row => row.id === "eligible");
        assert.deepEqual(eligible, {
            id: "eligible",
            customer_name: "-",
            customer_phone: null,
            address_line1: null,
        });
        assert.equal(rows.rows.find(row => row.id === "other-branch")?.customer_name, "Customer");
    } finally {
        await db.close();
    }
});
