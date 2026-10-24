/*
    PASSWORD HASHING - scrypt WITH A RANDOM SALT PER PASSWORD, NO EXTRA DEPENDENCY.

    Stored as "scrypt$<salt hex>$<hash hex>". Passwords are never stored or logged in plain text.
*/

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const HASH_BYTES = 64;

const derive = (password: string, salt: Buffer): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        scrypt(password, salt, HASH_BYTES, (err, key) => (err ? reject(err) : resolve(key)));
    });

export const hashPassword = async (password: string): Promise<string> => {
    const salt = randomBytes(SALT_BYTES);
    const hash = await derive(password, salt);

    return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
    const [scheme, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

    const expected = Buffer.from(hashHex, "hex");
    const actual = await derive(password, Buffer.from(saltHex, "hex"));

    return actual.length === expected.length && timingSafeEqual(actual, expected);
};
