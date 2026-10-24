import assert from "node:assert/strict";
import test from "node:test";

import { refundFullSchema, refundPartialSchema } from "../src/database/schemas";

test("refund schemas validate order ids, reason and positive integer amounts", () => {
    assert.deepEqual(refundFullSchema.parse({ order_id: "o1", reason: "  Cold food " }), {
        order_id: "o1",
        reason: "Cold food",
    });
    assert.deepEqual(refundFullSchema.parse({ order_id: "o1" }), { order_id: "o1" });
    assert.throws(() => refundFullSchema.parse({ order_id: "" }));
    assert.deepEqual(refundPartialSchema.parse({ order_id: "o1", amount: 500 }), { order_id: "o1", amount: 500 });
    assert.throws(() => refundPartialSchema.parse({ order_id: "o1", amount: 0 }));
    assert.throws(() => refundPartialSchema.parse({ order_id: "o1", amount: 1.5 }));
});
