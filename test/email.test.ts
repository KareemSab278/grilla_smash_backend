import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_DB_URL ??= "******localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

import { buildEmailContent } from "../src/notifications/email";

test("buildEmailContent escapes titles and every message line", () => {
    const html = buildEmailContent({
        title: `<Ready & "safe">`,
        message: `Hello <customer>\nUse "quotes" & apostrophes'`,
    });

    assert.match(html, /&lt;Ready &amp; &quot;safe&quot;&gt;/);
    assert.match(html, /<p>Hello &lt;customer&gt;<\/p>/);
    assert.match(html, /<p>Use &quot;quotes&quot; &amp; apostrophes&#39;<\/p>/);
    assert.doesNotMatch(html, /<p>Hello <customer><\/p>/);
});
