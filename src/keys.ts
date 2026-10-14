/*
    SECRET KEYS - the business key and password reset codes are stored and compared as sha256 hashes.

    keysMatch() compares in constant time, and a stored hash of the wrong length simply never matches.
*/

import { createHash, timingSafeEqual } from "node:crypto";

export const hashKey = (rawKey: string): string => createHash("sha256").update(rawKey).digest("hex");

export const keysMatch = (rawKey: string, storedHash: string): boolean => {
    const hashed = Buffer.from(hashKey(rawKey));
    const stored = Buffer.from(storedHash);

    return hashed.length === stored.length && timingSafeEqual(hashed, stored);
};
