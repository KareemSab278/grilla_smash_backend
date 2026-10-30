import assert from "node:assert/strict";
import test from "node:test";

process.env.SUPABASE_DB_URL ??= "******localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

test("Stripe refund guards reject missing references and invalid amounts before network calls", async () => {
    const { REFUND } = await import("../src/payment/stripeRefunding");

    await assert.rejects(REFUND.full(""), /Payment reference is required/);
    await assert.rejects(REFUND.partial("", 100), /Payment reference is required/);
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        await assert.rejects(REFUND.partial("pi_test", amount), /positive integer in pence/);
    }
});

test("Shift4 provider requirement reports a configuration error when unavailable", async () => {
    const { requireShift4 } = await import("../src/payment/payProviders");

    if (process.env.SHIFT4_SECRET_KEY) return;
    assert.throws(requireShift4, { status: 503, message: "Shift4 is not configured" });
});
