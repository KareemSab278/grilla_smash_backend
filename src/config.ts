/*
    ENV CONFIG - THE ONLY FILE THAT READS process.env.

    Loads ./.env (if present) from the working directory, validates everything once at startup and exports
    a frozen CONFIG object. A bad value throws immediately so the server never starts half configured.
    The database url is SUPABASE_DB_URL, falling back to DATABASE_URL.
*/

import { existsSync } from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

if (existsSync(ENV_PATH)) {
    process.loadEnvFile(ENV_PATH);
}

const DEFAULT_PORT = 8000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_DB_POOL_MAX = 10;
const DEFAULT_CORS_ORIGINS: readonly string[] = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
];

type Config = {
    readonly port: number;
    readonly host: string;
    readonly databaseUrl: string;
    readonly dbPoolMax: number;
    readonly corsOrigins: string[] | true;
};

const parseInteger = (name: string, raw: string | undefined, fallback: number, min: number, max: number): number => {
    if (raw === undefined || raw === "") return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Invalid ${name}: ${raw}`);
    }

    return value;
};

const getDatabaseUrl = (): string => {
    const value = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!value) {
        throw new Error("SUPABASE_DB_URL or DATABASE_URL missing");
    }

    return value;
};

const parseCorsOrigins = (raw: string | undefined): string[] | true => {
    if (raw === undefined || raw.trim() === "") return DEFAULT_CORS_ORIGINS;
    if (raw.trim() === "*") return true;

    return raw
        .split(",")
        .map(origin => origin.trim())
        .filter(origin => origin !== "");
};

export const CONFIG: Config = {
    port: parseInteger("PORT", process.env.PORT, DEFAULT_PORT, 0, 65535),
    host: process.env.HOST || DEFAULT_HOST,
    databaseUrl: getDatabaseUrl(),
    dbPoolMax: parseInteger("DB_POOL_MAX", process.env.DB_POOL_MAX, DEFAULT_DB_POOL_MAX, 1, 100),
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
};
