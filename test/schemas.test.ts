/*
    SCHEMA TESTS - run with `npm test` (node's built-in test runner through tsx, no database needed).

    These cover the zod request schemas only. Anything that needs Postgres is covered by curl-tests.sh.
*/

import assert from "node:assert/strict";
import test from "node:test";

import {
    businessCreateSchema,
    branchUnavailableProductsSchema,
    deliveryQuoteSchema,
    openingHoursPatchSchema,
    openingHoursSchema,
    offerCreateSchema,
    orderCreateSchema,
    orderStatusUpdateSchema,
    productListQuerySchema,
} from "../src/schemas";
import { DEFAULT_OPENING_HOURS, mergeOpeningHours } from "../src/branchHours";

const validOrder = {
    branch_id: "b1",
    customer_name: "Jo",
    items: [{ product_id: "p1", quantity: 2 }],
};

test("deliveryQuoteSchema requires a branch and complete delivery address", () => {
    assert.deepEqual(
        deliveryQuoteSchema.parse({
            branch_id: "b1",
            address_line1: "  1 Main Street ",
            city: " London ",
            postcode: " SW1A 1AA ",
        }),
        {
            branch_id: "b1",
            address_line1: "1 Main Street",
            city: "London",
            postcode: "SW1A 1AA",
        }
    );
    assert.throws(
        () => deliveryQuoteSchema.parse({ branch_id: "b1", address_line1: "1 Main Street", city: "London" }),
        /postcode/
    );
});

test("businessCreateSchema trims fields and defaults currency", () => {
    const parsed = businessCreateSchema.parse({
        name: "test",
        slug: "test-api",
        logo_url: null,
    });

    test("openingHoursSchema validates times and defaults closed flag", () => {
        const parsed = openingHoursSchema.parse(DEFAULT_OPENING_HOURS);

        assert.equal(parsed.monday.is_closed, false);
        assert.throws(
            () =>
                openingHoursSchema.parse({
                    ...DEFAULT_OPENING_HOURS,
                    monday: { open: "25:00", close: "17:00" },
                }),
            /Invalid time/
        );
    });

    test("openingHoursPatchSchema supports partial day updates and mergeOpeningHours preserves other days", () => {
        const patch = openingHoursPatchSchema.parse({
            monday: { open: "10:00" },
            sunday: { is_closed: true },
        });

        const merged = mergeOpeningHours(DEFAULT_OPENING_HOURS, patch);

        assert.equal(merged.monday.open, "10:00");
        assert.equal(merged.monday.close, "17:00");
        assert.equal(merged.tuesday.open, "09:00");
        assert.equal(merged.sunday.is_closed, true);
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

test("branchUnavailableProductsSchema accepts empty and populated product lists", () => {
    assert.deepEqual(branchUnavailableProductsSchema.parse({ unavailable_products: [] }), { unavailable_products: [] });
    assert.deepEqual(
        branchUnavailableProductsSchema.parse({ unavailable_products: ["p1", "p2"] }),
        { unavailable_products: ["p1", "p2"] }
    );
    assert.throws(() => branchUnavailableProductsSchema.parse({ unavailable_products: [""] }));
    assert.throws(() => branchUnavailableProductsSchema.parse({}));
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

test("orderCreateSchema applies defaults and strips client supplied prices", () => {
    const parsed = orderCreateSchema.parse({
        ...validOrder,
        total: 1,
        items: [{ product_id: "p1", quantity: 2, price: 1 }],
        payment: { provider: "stripe", provider_payment_id: "pi_test_123" },
    });

    assert.equal(parsed.order_type, "PICKUP");
    assert.equal(parsed.delivery_fee, 0);
    assert.deepEqual(parsed.items, [{ product_id: "p1", quantity: 2, modifier_ids: [] }]);
    assert.deepEqual(parsed.payment, { provider: "stripe", payment_reference: "pi_test_123" });
    assert.equal("total" in parsed, false);
});

test("orderCreateSchema prefers payment_reference when both payment keys are sent", () => {
    const parsed = orderCreateSchema.parse({
        ...validOrder,
        payment: {
            provider: "stripe",
            payment_reference: "pi_ref_123",
            provider_payment_id: "pi_old_123",
        },
    });

    assert.deepEqual(parsed.payment, { provider: "stripe", payment_reference: "pi_ref_123" });
});

test("orderCreateSchema requires an address for DELIVERY only", () => {
    assert.throws(() => orderCreateSchema.parse({ ...validOrder, order_type: "DELIVERY" }), /required for DELIVERY/);

    const delivery = orderCreateSchema.parse({
        ...validOrder,
        order_type: "DELIVERY",
        address_line1: "1 High Street",
        city: "London",
        postcode: "SW1A 1AA",
    });

    assert.equal(delivery.order_type, "DELIVERY");
});

test("orderCreateSchema rejects empty items, bad quantities and bad emails", () => {
    assert.throws(() => orderCreateSchema.parse({ ...validOrder, items: [] }));
    assert.throws(() => orderCreateSchema.parse({ ...validOrder, items: [{ product_id: "p1", quantity: 0 }] }));
    assert.throws(() => orderCreateSchema.parse({ ...validOrder, customer_email: "not-an-email" }));
});

test("orderStatusUpdateSchema only accepts known statuses", () => {
    assert.equal(orderStatusUpdateSchema.parse({ id: "o1", status: "READY" }).status, "READY");
    assert.throws(() => orderStatusUpdateSchema.parse({ id: "o1", status: "ready" }));
});
