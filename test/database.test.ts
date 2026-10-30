import assert from "node:assert/strict";
import test from "node:test";
import postgres from "postgres";

import { dbAll, dbGet, dbRun, mapDbError } from "../src/database/db";
import type { Db } from "../src/database/db";

type QueryCall = { query: string; params: readonly unknown[] };

const makeDb = (rows: object[] = []) => {
    const calls: QueryCall[] = [];
    const db = {
        unsafe: async <T extends object>(query: string, params: readonly unknown[] = []): Promise<T[]> => {
            calls.push({ query, params });
            return rows as T[];
        },
    } as unknown as Db;
    return { db, calls };
};

test("database query helpers forward SQL and parameters", async () => {
    const { db, calls } = makeDb([{ id: "one" }, { id: "two" }]);

    assert.deepEqual(await dbAll<{ id: string }>(db, "SELECT * FROM items WHERE id = $1", ["one"]), [
        { id: "one" },
        { id: "two" },
    ]);
    assert.deepEqual(await dbGet<{ id: string }>(db, "SELECT * FROM items WHERE id = $1", ["one"]), { id: "one" });
    await dbRun(db, "DELETE FROM items WHERE id = $1", ["one"]);

    assert.deepEqual(calls, [
        { query: "SELECT * FROM items WHERE id = $1", params: ["one"] },
        { query: "SELECT * FROM items WHERE id = $1", params: ["one"] },
        { query: "DELETE FROM items WHERE id = $1", params: ["one"] },
    ]);
});

test("dbGet returns undefined when no rows are returned", async () => {
    const { db } = makeDb();
    assert.equal(await dbGet(db, "SELECT 1"), undefined);
});

const makePostgresError = (
    code: string,
    details: Partial<{
        table_name: string;
        column_name: string;
        constraint_name: string;
        schema_name: string;
    }> = {}
): postgres.PostgresError =>
    Object.assign(Object.create(postgres.PostgresError.prototype), {
        code,
        ...details,
    }) as postgres.PostgresError;

test("mapDbError maps PostgreSQL constraint and data errors", () => {
    const cases = [
        ["23505", 409],
        ["23503", 409],
        ["23514", 400],
        ["23502", 400],
        ["22001", 400],
    ] as const;

    for (const [code, status] of cases) {
        const mapped = mapDbError(makePostgresError(code, {
            table_name: "orders",
            column_name: "status",
            constraint_name: "orders_status_check",
        }));
        assert.equal((mapped as { status: number }).status, status);
    }
});

test("mapDbError preserves unknown and non-PostgreSQL errors", () => {
    const postgresError = makePostgresError("42883");
    const regularError = new Error("connection failed");

    assert.equal(mapDbError(postgresError), postgresError);
    assert.equal(mapDbError(regularError), regularError);
});
