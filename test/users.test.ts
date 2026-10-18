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
    ADMIN_CREATION_CODE_WINDOW_MS,
    consumeAdminCreationCode,
    discardAdminCreationCode,
    issueAdminCreationCode,
} from "../src/adminCreationCodes";
import {
    adminCreateSchema,
    adminCreationCodeRequestSchema,
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

test("admin creation codes expire, bind to the requested identity and are single use", () => {
    const start = 5_000_000;
    const code = issueAdminCreationCode("admin_user", "admin@example.com", start);

    assert.match(code, /^\d{6}$/);
    assert.equal(consumeAdminCreationCode("different_user", "admin@example.com", code, start), false);
    assert.equal(consumeAdminCreationCode("admin_user", "different@example.com", code, start), false);
    assert.equal(consumeAdminCreationCode("admin_user", "admin@example.com", code, start + ADMIN_CREATION_CODE_WINDOW_MS), false);

    const nextCode = issueAdminCreationCode("admin_user", "admin@example.com", start + ADMIN_CREATION_CODE_WINDOW_MS);
    assert.equal(consumeAdminCreationCode("admin_user", "admin@example.com", nextCode, start + ADMIN_CREATION_CODE_WINDOW_MS), true);
    assert.equal(consumeAdminCreationCode("admin_user", "admin@example.com", nextCode, start + ADMIN_CREATION_CODE_WINDOW_MS), false);
    discardAdminCreationCode("admin_user", "admin@example.com");
});

test("admin creation codes are rate limited and expire after five incorrect attempts", () => {
    const start = 6_000_000;
    const code = issueAdminCreationCode("admin_user_2", "admin2@example.com", start);
    const wrong = code === "000000" ? "000001" : "000000";

    assert.throws(
        () => issueAdminCreationCode("admin_user_2", "admin2@example.com", start + 1000),
        { status: 429 }
    );
    for (let i = 0; i < 5; i++) {
        assert.equal(consumeAdminCreationCode("admin_user_2", "admin2@example.com", wrong, start + i), false);
    }
    assert.equal(consumeAdminCreationCode("admin_user_2", "admin2@example.com", code, start + 10), false);
});

test("userCreateSchema trims the username and lowercases the email", () => {
    const parsed = userCreateSchema.parse({ username: "  joe  ", password: "longenough", email: "Jo@Example.COM" });

    assert.equal(parsed.username, "joe");
    assert.equal(parsed.email, "jo@example.com");
});

test("admin creation schemas validate request identity and verification code", () => {
    const request = adminCreationCodeRequestSchema.parse({ username: "  new_admin ", email: "New@Example.COM" });
    assert.deepEqual(request, { username: "new_admin", email: "new@example.com" });
    assert.equal(adminCreationCodeRequestSchema.safeParse({ username: "ab", email: "invalid" }).success, false);

    const valid = {
        username: "new_admin",
        password: "longenough",
        email: "new@example.com",
        verification_code: "123456",
    };
    assert.equal(adminCreateSchema.safeParse(valid).success, true);
    assert.equal(adminCreateSchema.safeParse({ ...valid, verification_code: "12345" }).success, false);
    assert.equal(adminCreateSchema.safeParse({ ...valid, email: "New@Example.COM" }).success, true);
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
