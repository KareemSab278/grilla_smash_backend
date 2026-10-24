import assert from "node:assert/strict";
import test from "node:test";

import { refundFullSchema, refundPartialSchema } from "../src/database/schemas";

test("refund schemas validate payment references and positive integer amounts", () => {
    assert.deepEqual(refundFullSchema.parse({ paymentRef: "  pi_test_123 " }), { paymentRef: "pi_test_123" });
    assert.throws(() => refundFullSchema.parse({ paymentRef: " " }));
    assert.deepEqual(refundPartialSchema.parse({ paymentRef: "pi_test_123", amount: 500 }), {
        paymentRef: "pi_test_123",
        amount: 500,
    });
    assert.throws(() => refundPartialSchema.parse({ paymentRef: "pi_test_123", amount: 0 }));
    assert.throws(() => refundPartialSchema.parse({ paymentRef: "pi_test_123", amount: 1.5 }));
});
