/*
    ENV CONFIG - THE ONLY FILE THAT READS process.env.

    Loads ./.env (if present) from the working directory, validates everything once at startup and exports
    a frozen CONFIG object. A bad value throws immediately so the server never starts half configured.
    The database url is SUPABASE_DB_URL, falling back to DATABASE_URL.
    Stripe and Resend keys are required. Shift4 is a fallback payment provider, so its key is optional.
*/

import { existsSync } from "node:fs";
import path from "node:path";

// ENV VARIABLES AND DEFAULTS
const ENV_PATH = path.resolve(process.cwd(), ".env");
if (existsSync(ENV_PATH)) {
    process.loadEnvFile(ENV_PATH);
}

const EMAIL_FROM_DEFAULT = "test_business <grillasmash@gmail.com>";
const EMAIL_FROM_PATTERN = /^(?:[^<>]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/;
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || EMAIL_FROM_DEFAULT;
if (!EMAIL_FROM_PATTERN.test(EMAIL_FROM)) {
    throw new Error("Invalid EMAIL_FROM; use email@example.com or Name <email@example.com>");
}

const CORS_ORIGINS: readonly string[] = [process.env.CORS_ORIGINS ?? '*'];
const DEFAULT_PORT = Number(process.env.DEFAULT_PORT ?? 8000);
const DEFAULT_HOST = process.env.DEFAULT_HOST ?? "127.0.0.1";
const DEFAULT_DB_POOL_MAX = Number(process.env.DEFAULT_DB_POOL_MAX ?? 10);
const DEFAULT_MAX_DELIVERY_DISTANCE_KM = Number(process.env.MAX_DELIVERY_DISTANCE_KM ?? 8);

type Config = {
    readonly isDevelopment: boolean;
    readonly googleMapsApiKey: string | undefined;
    readonly port: number;
    readonly host: string;
    readonly databaseUrl: string;
    readonly dbPoolMax: number;
    readonly supabaseUrl: string | undefined;
    readonly supabaseSecretKey: string | undefined;
    readonly imageBucketName: string | undefined;
    readonly corsOrigins: string[] | true;
    readonly branchSettingsAuthEnabled: boolean;
    readonly useStripe: boolean;
    readonly maxDeliveryDistanceKm: number;
    readonly stripeSecretKey: string;
    readonly shift4SecretKey: string | undefined;
    readonly resendApiKey: string;
    readonly emailFrom: string;
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

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} missing`);

    return value;
};

const parseCorsOrigins = (raw: string | undefined): string[] | true => {
    if (raw === undefined || raw.trim() === "") return CORS_ORIGINS as string[];
    if (raw.trim() === "*") return true;

    return raw
        .split(",")
        .map(origin => origin.trim())
        .filter(origin => origin !== "");
};

const parseBoolean = (raw: string | undefined, fallback: boolean): boolean => {
    if (raw === undefined || raw.trim() === "") return fallback;

    const value = raw.trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes" || value === "on") return true;
    if (value === "false" || value === "0" || value === "no" || value === "off") return false;

    throw new Error(`Invalid boolean: ${raw}`);
};

const DEV = process.env.NODE_ENV === "development";

export const CONFIG: Config = {
    isDevelopment: DEV,
    port: parseInteger("PORT", process.env.PORT, DEFAULT_PORT, 0, 65535),
    host: process.env.HOST || DEFAULT_HOST,
    databaseUrl: getDatabaseUrl(),
    dbPoolMax: parseInteger("DB_POOL_MAX", process.env.DB_POOL_MAX, DEFAULT_DB_POOL_MAX, 1, 100),
    supabaseUrl: process.env.SUPABASE_URL || undefined,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    imageBucketName: process.env.SUPABASE_IMAGE_BUCKET || undefined,
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
    branchSettingsAuthEnabled: parseBoolean(process.env.BRANCH_SETTINGS_AUTH_ENABLED, false),
    useStripe: parseBoolean(process.env.USE_STRIPE, true),
    stripeSecretKey: requireEnv(DEV ? "STRIPE_SECRET_TEST_KEY" : "STRIPE_SECRET_KEY"),
    maxDeliveryDistanceKm: parseInteger("MAX_DELIVERY_DISTANCE_KM", process.env.MAX_DELIVERY_DISTANCE_KM, DEFAULT_MAX_DELIVERY_DISTANCE_KM, 1, 100),
    shift4SecretKey: process.env.SHIFT4_SECRET_KEY || undefined,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || undefined,
    resendApiKey: requireEnv("RESEND_API_KEY"),
    emailFrom: EMAIL_FROM,
};
