/*
    SHARED HELPERS - SMALL, GENERIC UTILITIES USED BY SEVERAL HANDLERS.

    ids        newId() gives 12 hex chars (same shape as the old backend)
    nulls      orNull() maps undefined -> null so a value can be bound as a sql parameter
    lookups    getRequiredRow / requireRow / deleteById throw a 404 when the row is missing
    batching   groupBy() lets handlers load all child rows in one query and stitch them in memory (no N+1)
    payments   normalizeAmount() / buildCheckoutRequest() turn client amounts into minor units (pence)
*/

import { randomBytes } from "node:crypto";
import { badRequest, notFound } from "./errors";
import { dbGet } from "./db";
import type { Db } from "./db";
import type { DeleteResponse, SqlParam } from "./types";

// 12 hex chars, same shape as the ids the old backend generated
export const newId = (): string => randomBytes(6).toString("hex");

// null/undefined = "leave the column alone" (paired with COALESCE in the UPDATE queries)
export const orNull = <T extends SqlParam>(value: T | undefined): T | null => value ?? null;

export const getRequiredRow = async <T extends object>(
    db: Db,
    query: string,
    id: string,
    label: string
): Promise<T> => {
    const row = await dbGet<T>(db, query, [id]);
    if (!row) throw notFound(`${label} not found`);
    return row;
};

export const requireRow = <T>(row: T | undefined, label: string): T => {
    if (row === undefined) throw notFound(`${label} not found`);
    return row;
};

export const deleteById = async (db: Db, query: string, id: string, label: string): Promise<DeleteResponse> => {
    requireRow(await dbGet(db, query, [id]), label);
    return { success: true, deleted: id };
};

export const groupBy = <T, K extends string>(items: readonly T[], getKey: (item: T) => K): Map<K, T[]> => {
    const groups = new Map<K, T[]>();

    for (const item of items) {
        const key = getKey(item);
        const bucket = groups.get(key);
        if (bucket) bucket.push(item);
        else groups.set(key, [item]);
    }

    return groups;
};

export const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

export const findDuplicate = (values: readonly string[]): string | undefined => {
    const seen = new Set<string>();

    for (const value of values) {
        if (seen.has(value)) return value;
        seen.add(value);
    }

    return undefined;
};

// ========================================

// a number is already in minor units, a string with a "." is in major units ("12.5" -> 1250)
const toMinorUnits = (amount: string | number | undefined): number => {
    if (amount === undefined || amount === null || amount === "") return NaN;
    if (typeof amount === "number") return Math.round(amount);

    const trimmed = String(amount).trim();
    if (!trimmed.includes(".")) return Number(trimmed);

    const [whole, fraction = ""] = trimmed.split(".");
    return Number(`${whole}${(fraction + "00").slice(0, 2)}`);
};

export const normalizeAmount = (amount: string | number | undefined): number => {
    const minorUnits = toMinorUnits(amount);
    if (!Number.isFinite(minorUnits) || minorUnits <= 0) throw badRequest("Invalid amount");

    return minorUnits;
};

export const buildCheckoutRequest = ({ amount, currency = "GBP" }: { amount: string | number; currency?: string }) => ({
    charge: {
        amount: normalizeAmount(amount),
        currency: currency.toUpperCase(),
    },
});
