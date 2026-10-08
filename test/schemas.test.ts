import assert from "node:assert/strict";
import test from "node:test";

import {
    businessCreateSchema,
    offerCreateSchema,
    productListQuerySchema,
} from "../src/schemas";

test("businessCreateSchema trims fields and defaults currency", () => {
    const parsed = businessCreateSchema.parse({
        name: "test",
        slug: "test-api",
        logo_url: null,
    });

    assert.deepEqual(parsed, {
        name: "test",
        slug: "test-api",
        logo_url: null,
        currency: "GBP",
    });
});

test("productListQuerySchema accepts boolean-like query values", () => {
    assert.equal(productListQuerySchema.parse({}).active_only, false);
    assert.equal(productListQuerySchema.parse({ active_only: "true" }).active_only, true);
    assert.equal(productListQuerySchema.parse({ active_only: "0" }).active_only, false);
});

test("offerCreateSchema rejects invalid dates and accepts valid ones", () => {
    assert.throws(
        () => offerCreateSchema.parse({ name: "Meal", starts_at: "not-a-date", ends_at: null }),
        /Invalid date\/time/
    );

    const parsed = offerCreateSchema.parse({
        name: "Meal",
        starts_at: "2026-10-08T12:00:00Z",
        ends_at: "2026-10-09T12:00:00Z",
    });

    assert.equal(parsed.active, true);
    assert.equal(parsed.rules.length, 0);
});
