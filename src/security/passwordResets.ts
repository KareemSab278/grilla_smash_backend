/*
    PASSWORD RESET CODES - HELD IN SERVER MEMORY ONLY, NEVER WRITTEN TO THE DATABASE.

    { identifier: { code_hash, last_request, attempts } }, one entry per account identifier.
    - a code lives RESET_WINDOW_MS, and a new one cannot be requested until that window has passed
      (so an entry exists exactly while its code is still usable, and expired entries are dropped lazily)
    - a code is single use and dies after MAX_ATTEMPTS wrong guesses
    - only a sha256 of the code is kept
    Memory is per process: with several server instances the reset request and the reset must hit the same one.
*/

import { randomInt } from "node:crypto";
import { tooManyRequests } from "../helpers/errors";
import { hashKey, keysMatch } from "./keys";

export const RESET_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type ResetEntry = {
    code_hash: string;
    last_request: number;
    attempts: number;
};

const resets = new Map<string, ResetEntry>();

const isExpired = (entry: ResetEntry, now: number): boolean => now - entry.last_request >= RESET_WINDOW_MS;

// returns the plain code (to email), throws a 429 while the previous code is still valid
export const issueResetCode = (identifier: string, now: number = Date.now()): string => {
    const existing = resets.get(identifier);

    if (existing && !isExpired(existing, now)) {
        const minutes = Math.ceil((RESET_WINDOW_MS - (now - existing.last_request)) / 60_000);
        throw tooManyRequests(`A reset code was already sent. Try again in ${minutes} minute(s)`);
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    resets.set(identifier, { code_hash: hashKey(code), last_request: now, attempts: 0 });

    return code;
};

export const consumeResetCode = (identifier: string, code: string, now: number = Date.now()): boolean => {
    const entry = resets.get(identifier);
    if (!entry) return false;

    if (isExpired(entry, now)) {
        resets.delete(identifier);
        return false;
    }

    if (keysMatch(code, entry.code_hash)) {
        resets.delete(identifier);
        return true;
    }

    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) resets.delete(identifier);

    return false;
};

export const discardResetCode = (identifier: string): void => {
    resets.delete(identifier);
};
