/*
    USER / SECURITY TESTS - run with `npm test`, no database or env needed.

    Covers password hashing, business key hashing, the in-memory reset codes and the user zod schemas.
*/

import assert from "node:assert/strict";
import test from "node:test";

import { hashKey, keysMatch } from "../src/keys";
import { hashPassword, verifyPassword } from "../src/passwords";
import { consumeResetCode, discardResetCode, issueResetCode, RESET_WINDOW_MS } from "../src/passwordResets";
import {
    userCreateSchema,
    userLoginSchema,
    userPasswordResetLegacySchema,
    userPasswordResetRequestSchema,
    userPasswordResetSchema,
} from "../src/schemas";

test("hashPassword salts every hash and verifyPassword checks it", async () => {
    const first = await hashPassword("correct horse");
    const second = await hashPassword("correct horse");

    assert.notEqual(first, second);
    assert.ok(!first.includes("correct horse"));
    assert.equal(await verifyPassword("correct horse", first), true);
    assert.equal(await verifyPassword("wrong horse", first), false);
    assert.equal(await verifyPassword("correct horse", "not-a-hash"), false);
});

test("keysMatch accepts the right key only", () => {
    const stored = hashKey("business-key");

    assert.equal(keysMatch("business-key", stored), true);
    assert.equal(keysMatch("other-key", stored), false);
    assert.equal(keysMatch("business-key", "short"), false);
});

test("a reset code is 6 digits, single use, and blocks a new request for 5 minutes", () => {
    const start = 1_000_000;
    const code = issueResetCode("u1", start);

    assert.match(code, /^\d{6}$/);
    assert.throws(() => issueResetCode("u1", start + 1000), { status: 429 });

    assert.equal(consumeResetCode("u1", code, start + 1000), true);
    assert.equal(consumeResetCode("u1", code, start + 2000), false);
});

test("a reset code expires after the window and a new one can then be issued", () => {
    const start = 2_000_000;
    const code = issueResetCode("u2", start);

    assert.equal(consumeResetCode("u2", code, start + RESET_WINDOW_MS), false);
    assert.match(issueResetCode("u2", start + RESET_WINDOW_MS), /^\d{6}$/);
    discardResetCode("u2");
});

test("a reset code dies after 5 wrong guesses", () => {
    const start = 3_000_000;
    const code = issueResetCode("u3", start);
    const wrong = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i++) assert.equal(consumeResetCode("u3", wrong, start + i), false);

    assert.equal(consumeResetCode("u3", code, start + 10), false);
});

test("codes are tracked per user", () => {
    const start = 4_000_000;
    const codeA = issueResetCode("a", start);
    issueResetCode("b", start);

    assert.equal(consumeResetCode("a", codeA, start), true);
    discardResetCode("b");
    assert.equal(consumeResetCode("b", codeA, start), false);
});

test("userCreateSchema trims the username and lowercases the email", () => {
    const parsed = userCreateSchema.parse({ username: "  joe  ", password: "longenough", email: "Jo@Example.COM" });

    assert.equal(parsed.username, "joe");
    assert.equal(parsed.email, "jo@example.com");
});

test("userCreateSchema rejects short passwords, bad emails and short usernames", () => {
    const valid = { username: "jo_admin", password: "longenough", email: "jo@example.com" };

    assert.equal(userCreateSchema.safeParse({ ...valid, password: "short" }).success, false);
    assert.equal(userCreateSchema.safeParse({ ...valid, email: "nope" }).success, false);
    assert.equal(userCreateSchema.safeParse({ ...valid, username: "ab" }).success, false);
});

test("userLoginSchema trims the username and requires a password", () => {
    const parsed = userLoginSchema.parse({ username: "  joe  ", password: "longenough" });

    assert.equal(parsed.username, "joe");
    assert.equal(userLoginSchema.safeParse({ username: "joe", password: "short" }).success, false);
});

test("userPasswordResetRequestSchema lowercases the email", () => {
    const parsed = userPasswordResetRequestSchema.parse({ email: "Jo@Example.COM" });

    assert.equal(parsed.email, "jo@example.com");
});

test("userPasswordResetSchema needs email, code and a long enough password", () => {
    assert.equal(
        userPasswordResetSchema.safeParse({ email: "jo@example.com", reset_code: "123456", new_password: "longenough" }).success,
        true
    );
    assert.equal(
        userPasswordResetSchema.safeParse({ email: "jo@example.com", reset_code: "12345", new_password: "longenough" }).success,
        false
    );
    assert.equal(userPasswordResetSchema.safeParse({ email: "jo@example.com", reset_code: "123456", new_password: "short" }).success, false);
});

test("userPasswordResetLegacySchema needs a 6 digit code and a long enough password", () => {
    assert.equal(userPasswordResetLegacySchema.safeParse({ reset_code: "123456", new_password: "longenough" }).success, true);
    assert.equal(userPasswordResetLegacySchema.safeParse({ reset_code: "12345", new_password: "longenough" }).success, false);
    assert.equal(userPasswordResetLegacySchema.safeParse({ reset_code: "123456", new_password: "short" }).success, false);
});
