import postgres from "postgres";
import dns from "node:dns";
import { CONFIG } from "./config";
import { badRequest, conflict } from "./errors";
import type { SqlParam } from "./types";

// postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_CHECK_VIOLATION = "23514";
const PG_NOT_NULL_VIOLATION = "23502";
const PG_DATA_EXCEPTION_CLASS = "22";

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

const getPgCode = (err: unknown): string | undefined => {
    if (!(err instanceof postgres.PostgresError)) return undefined;
    return err.code;
};

// turns postgres constraint / data failures into 4xx instead of leaking them as 500s
export const mapDbError = (err: unknown): unknown => {
    const code = getPgCode(err);
    if (code === undefined) return err;

    if (code === PG_UNIQUE_VIOLATION) return conflict("A record with those values already exists");

    if (code === PG_FOREIGN_KEY_VIOLATION) {
        return conflict("Record is still referenced by other data (or references something that does not exist)");
    }

    if (code === PG_CHECK_VIOLATION || code === PG_NOT_NULL_VIOLATION || code.startsWith(PG_DATA_EXCEPTION_CLASS)) {
        return badRequest("One or more values are invalid");
    }

    return err;
};

export default sql;
