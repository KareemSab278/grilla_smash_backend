/*
    SCHEMA TESTS - run with `npm test` (node's built-in test runner through tsx, no database needed).

    These cover the zod request schemas only. Anything that needs Postgres is covered by curl-tests.sh.
*/

import assert from "node:assert/strict";
import test from "node:test";

import {
    businessCreateSchema,
    branchUpdateSchema,
    branchUnavailableProductsSchema,
    deliveryQuoteSchema,
    openingHoursPatchSchema,
    openingHoursSchema,
    offerCreateSchema,
    orderCreateSchema,
    orderStatusUpdateSchema,
    productCreateSchema,
    productUpdateSchema,
    productListQuerySchema,
} from "../src/database/schemas";
import { DEFAULT_OPENING_HOURS, mergeOpeningHours } from "../src/branches/branchHours";

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

    assert.deepEqual(parsed, {
        name: "test",
        slug: "test-api",
        logo_url: null,
        currency: "GBP",
    });
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

test("opening hours merging handles time changes, closed flags, and does not mutate input", () => {
    const current = {
        ...DEFAULT_OPENING_HOURS,
        monday: { open: "08:00", close: "18:00", is_closed: true },
    };
    const patch = {
        monday: { open: "09:00" },
        tuesday: { close: "19:00" },
        wednesday: { is_closed: true },
    };

    const merged = mergeOpeningHours(current, patch);

    assert.deepEqual(merged.monday, { open: "09:00", close: "18:00", is_closed: false });
    assert.deepEqual(merged.tuesday, { open: "09:00", close: "19:00", is_closed: false });
    assert.deepEqual(merged.wednesday, { open: "09:00", close: "17:00", is_closed: true });
    assert.deepEqual(current.monday, { open: "08:00", close: "18:00", is_closed: true });
});

test("productListQuerySchema accepts boolean-like query values", () => {
    assert.equal(productListQuerySchema.parse({}).active_only, false);
    assert.equal(productListQuerySchema.parse({ active_only: "true" }).active_only, true);
    assert.equal(productListQuerySchema.parse({ active_only: "0" }).active_only, false);
    assert.equal(productListQuerySchema.parse({ include_hidden: "true" }).include_hidden, true);
});

test("product schemas accept and normalize removable ingredients", () => {
    const product = productCreateSchema.parse({ name: "Burger", price: 899, ingredients: [" Lettuce ", "Tomato"] });
    assert.deepEqual(product.ingredients, ["Lettuce", "Tomato"]);
    assert.deepEqual(productCreateSchema.parse({ name: "Side", price: 300 }).ingredients, []);
    assert.deepEqual(productUpdateSchema.parse({ ingredients: [" Onion "] }).ingredients, ["Onion"]);
});

test("product schemas default hidden to false and accept updates", () => {
    assert.equal(productCreateSchema.parse({ name: "Burger", price: 899 }).hidden, false);
    assert.equal(productCreateSchema.parse({ name: "Burger", price: 899, hidden: true }).hidden, true);
    assert.equal(productCreateSchema.parse({ name: "Burger", price: 899 }).active, true);
    assert.equal(productCreateSchema.parse({ name: "Burger", price: 899, active: false }).active, false);
    assert.equal(productUpdateSchema.parse({ hidden: true }).hidden, true);
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

test("branchUpdateSchema accepts delivery and pickup settings", () => {
    assert.deepEqual(
        branchUpdateSchema.parse({
            delivery_disabled: true,
            pickup_disabled: false,
            delivery_range_km: 12,
        }),
        {
            delivery_disabled: true,
            pickup_disabled: false,
            delivery_range_km: 12,
        }
    );
    assert.throws(() => branchUpdateSchema.parse({ delivery_range_km: 1.5 }));
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
    assert.deepEqual(parsed.items, [{ product_id: "p1", quantity: 2, modifier_ids: [], removed_ingredients: [] }]);
    assert.deepEqual(parsed.payment, { provider: "stripe", payment_reference: "pi_test_123" });
    assert.equal("total" in parsed, false);
});

test("orderCreateSchema accepts trimmed removals for regular and offer items", () => {
    const parsed = orderCreateSchema.parse({
        ...validOrder,
        items: [{ product_id: "p1", quantity: 1, removed_ingredients: [" Lettuce "] }],
        offers: [{
            offer_id: "o1",
            rules: [{ offer_rule_id: "r1", items: [{ product_id: "p1", removed_ingredients: [" Onion "] }] }],
        }],
    });
    assert.deepEqual(parsed.items[0]?.removed_ingredients, ["Lettuce"]);
    assert.deepEqual(parsed.offers[0]?.rules[0]?.items[0]?.removed_ingredients, ["Onion"]);
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
