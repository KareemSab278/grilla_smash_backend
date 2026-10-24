/*
    DATABASE LAYER - POSTGRES (SUPABASE) CONNECTION POOL + QUERY HELPERS.

    - dbAll / dbGet / dbRun take a Db handle, which is either the pool (sql) or a transaction handle (tx),
      so the same helper works inside and outside a transaction. Always use the tx handle inside transaction().
    - Only static SQL from queries.ts is ever passed in, values always go through $1, $2... parameters.
    - ssl is required (Supabase only accepts TLS) and DNS prefers IPv4 because the direct Supabase host can
      resolve to IPv6 which many networks cannot reach (ECONNREFUSED on an IPv6 address).
    - mapDbError turns constraint failures (unique / foreign key / check / bad data) into 4xx responses.
*/

import postgres from "postgres";
import dns from "node:dns";
import { CONFIG } from "../config";
import { badRequest, conflict } from "../helpers/errors";
import type { SqlParam } from "../types";

// postgres error codes:
const PG_VIOLATION = {
    UNIQUE: "23505",
    FOREIGN_KEY: "23503",
    CHECK: "23514",
    NOT_NULL: "23502",
    DATA_EXCEPTION_CLASS: "22",
};

const DB_CLOSE_TIMEOUT_SECONDS = 5;

dns.setDefaultResultOrder("ipv4first");

const sql = postgres(CONFIG.databaseUrl, {
    max: CONFIG.dbPoolMax,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    onnotice: () => {},
});

// sql and the transaction handle share the same interface, so every helper below works with either
export type Db = Pick<postgres.Sql, "unsafe">;

// ========================================

export const dbAll = <T extends object>(db: Db, query: string, params: readonly SqlParam[] = []): Promise<T[]> =>
    db.unsafe<T[]>(query, [...params]);

export const dbGet = async <T extends object>(
    db: Db,
    query: string,
    params: readonly SqlParam[] = []
): Promise<T | undefined> => {
    const [row] = await db.unsafe<T[]>(query, [...params]);
    return row;
};

export const dbRun = async (db: Db, query: string, params: readonly SqlParam[] = []): Promise<void> => {
    await db.unsafe(query, [...params]);
};

// commits when work resolves, rolls back (and rethrows) when it throws. Only ever use the tx handle inside work
export const transaction = async <T>(work: (tx: Db) => Promise<T>): Promise<T> => {
    const result = await sql.begin(work);
    return result as T;
};

export const closeDb = async (): Promise<void> => {
    await sql.end({ timeout: DB_CLOSE_TIMEOUT_SECONDS });
};

export const checkDb = async (): Promise<void> => {
    await sql`SELECT 1`;
};

// ========================================

// turns Postgres constraint / data failures into 4xx instead of leaking them as 500s
export const mapDbError = (err: unknown): unknown => {
    if (!(err instanceof postgres.PostgresError)) return err;
    const code = err.code;

    const isMappedDbError =
        code === PG_VIOLATION.UNIQUE ||
        code === PG_VIOLATION.FOREIGN_KEY ||
        code === PG_VIOLATION.CHECK ||
        code === PG_VIOLATION.NOT_NULL ||
        code.startsWith(PG_VIOLATION.DATA_EXCEPTION_CLASS);

    if (isMappedDbError) {
        const details = [
            err.table_name && `table ${err.table_name}`,
            err.column_name && `column ${err.column_name}`,
            err.constraint_name && `constraint ${err.constraint_name}`,
        ].filter((detail): detail is string => Boolean(detail));

        console.error("[db] mapped PostgreSQL constraint/data error", {
            code,
            schema: err.schema_name,
            table: err.table_name,
            column: err.column_name,
            constraint: err.constraint_name,
        });

        if (
            CONFIG.isDevelopment &&
            (code === PG_VIOLATION.CHECK ||
                code === PG_VIOLATION.NOT_NULL ||
                code.startsWith(PG_VIOLATION.DATA_EXCEPTION_CLASS))
        ) {
            return badRequest(`One or more values are invalid (${[code, ...details].join("; ")})`);
        }
    }

    if (code === PG_VIOLATION.UNIQUE) return conflict("A record with those values already exists");

    if (code === PG_VIOLATION.FOREIGN_KEY) {
        return conflict("Record is still referenced by other data (or references something that does not exist)");
    }

    if (code === PG_VIOLATION.CHECK || code === PG_VIOLATION.NOT_NULL || code.startsWith(PG_VIOLATION.DATA_EXCEPTION_CLASS)) {
        return badRequest("One or more values are invalid");
    }

    return err;
};

export default sql;
