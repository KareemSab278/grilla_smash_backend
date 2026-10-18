/*
    ADMIN CREATION CODES - SHORT-LIVED, SINGLE-USE CODES STORED AS HASHES IN PROCESS MEMORY.
*/

import { randomInt } from "node:crypto";
import { tooManyRequests } from "./errors";
import { hashKey, keysMatch } from "./keys";

export const ADMIN_CREATION_CODE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type AdminCreationEntry = {
    code_hash: string;
    last_request: number;
    attempts: number;
};

const codes = new Map<string, AdminCreationEntry>();

const getIdentifier = (username: string, email: string): string => `${username.toLowerCase()}\0${email.toLowerCase()}`;
const isExpired = (entry: AdminCreationEntry, now: number): boolean =>
    now - entry.last_request >= ADMIN_CREATION_CODE_WINDOW_MS;

export const issueAdminCreationCode = (
    username: string,
    email: string,
    now: number = Date.now()
): string => {
    const identifier = getIdentifier(username, email);
    const existing = codes.get(identifier);

    if (existing && !isExpired(existing, now)) {
        const minutes = Math.ceil((ADMIN_CREATION_CODE_WINDOW_MS - (now - existing.last_request)) / 60_000);
        throw tooManyRequests(`An admin creation code was already sent. Try again in ${minutes} minute(s)`);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    codes.set(identifier, { code_hash: hashKey(code), last_request: now, attempts: 0 });
    return code;
};

export const consumeAdminCreationCode = (
    username: string,
    email: string,
    code: string,
    now: number = Date.now()
): boolean => {
    const identifier = getIdentifier(username, email);
    const entry = codes.get(identifier);
    if (!entry) return false;

    if (isExpired(entry, now)) {
        codes.delete(identifier);
        return false;
    }

    if (keysMatch(code, entry.code_hash)) {
        codes.delete(identifier);
        return true;
    }

    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) codes.delete(identifier);
    return false;
};

export const discardAdminCreationCode = (username: string, email: string): void => {
    codes.delete(getIdentifier(username, email));
};
