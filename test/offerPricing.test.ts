/*
    OFFER PRICING TESTS - pure functions, no database needed (`npm test`).
*/

import assert from "node:assert/strict";
import test from "node:test";

import { freeItems, priceBundle } from "../src/offerPricing";
import { orderCreateSchema } from "../src/schemas";
import type { OfferResponse, OrderPricingProductRow } from "../src/types";

const date = new Date("2026-01-01T00:00:00Z");
const now = new Date("2026-06-01T12:00:00Z");

const product = (id: string, price: number, extra: Partial<OrderPricingProductRow> = {}): OrderPricingProductRow => ({
    id,
    name: `Product ${id}`,
    active: true,
    price,
    branch_active: null,
    price_override: null,
    branch_unavailable: false,
    ...extra,
});

const products = new Map([product("burger", 800), product("fries", 300), product("cola", 200)].map(row => [row.id, row]));

const productRow = (id: string, price: number) => ({
    id,
    name: `Product ${id}`,
    description: null,
    price,
    image_url: null,
    sort_order: 0,
    active: true,
    created_at: date,
    updated_at: date,
});

const makeOffer = (overrides: Partial<OfferResponse> = {}): OfferResponse => ({
    id: "meal",
    name: "Meal deal",
    description: null,
    type: "FIXED_PRICE",
    price: 1000,
    percentage: null,
    discount_amount: null,
    starts_at: null,
    ends_at: null,
    sort_order: 0,
    active: true,
    created_at: date,
    updated_at: date,
    rules: [
        {
            id: "main",
            offer_id: "meal",
            name: "Main",
            quantity: 1,
            sort_order: 0,
            products: [productRow("burger", 800)],
            modifier_groups: [],
        },
        {
            id: "side",
            offer_id: "meal",
            name: "Side",
            quantity: 1,
            sort_order: 1,
            products: [productRow("fries", 300), productRow("cola", 200)],
            modifier_groups: [
                {
                    id: "size",
                    name: "Size",
                    required: true,
                    min_selections: 1,
                    max_selections: 1,
                    sort_order: 0,
                    active: true,
                    created_at: date,
                    updated_at: date,
                    modifiers: [
                        { id: "large", modifier_group_id: "size", name: "Large", price: 50, sort_order: 0, active: true, created_at: date, updated_at: date },
                        { id: "small", modifier_group_id: "size", name: "Small", price: 0, sort_order: 1, active: true, created_at: date, updated_at: date },
                    ],
                },
            ],
        },
    ],
    ...overrides,
});

const bundle = (overrides: Record<string, unknown> = {}) =>
    orderCreateSchema.parse({
        branch_id: "b1",
        customer_name: "Jo",
        offers: [
            {
                offer_id: "meal",
                rules: [
                    { offer_rule_id: "main", items: [{ product_id: "burger" }] },
                    { offer_rule_id: "side", items: [{ product_id: "fries", modifier_ids: ["small"] }] },
                ],
                ...overrides,
            },
        ],
    }).offers[0]!;

test("FIXED_PRICE charges the offer price and gives the rest as discount", () => {
    const priced = priceBundle(makeOffer(), bundle(), products, now);

    assert.equal(priced.discount, 100); // 800 + 300 - 1000
    assert.equal(priced.items.reduce((sum, item) => sum + item.total, 0), 1100);
});

test("modifiers are charged on top of a FIXED_PRICE offer and multiplied by quantity", () => {
    const priced = priceBundle(
        makeOffer(),
        bundle({
            quantity: 2,
            rules: [
                { offer_rule_id: "main", items: [{ product_id: "burger" }] },
                { offer_rule_id: "side", items: [{ product_id: "fries", modifier_ids: ["large"] }] },
            ],
        }),
        products,
        now
    );

    assert.equal(priced.discount, 200);
    assert.equal(priced.items.reduce((sum, item) => sum + item.total, 0), 2 * (800 + 350));
});

test("PERCENTAGE and FIXED_DISCOUNT are taken off the list value", () => {
    const percentage = priceBundle(makeOffer({ type: "PERCENTAGE", percentage: 10, price: null }), bundle(), products, now);
    assert.equal(percentage.discount, 110);

    const fixed = priceBundle(makeOffer({ type: "FIXED_DISCOUNT", discount_amount: 5000, price: null }), bundle(), products, now);
    assert.equal(fixed.discount, 1100); // capped at the list value
});

test("branch price overrides are used", () => {
    const overridden = new Map(products).set("burger", product("burger", 800, { price_override: 600 }));
    const priced = priceBundle(makeOffer(), bundle(), overridden, now);

    assert.equal(priced.discount, 0); // 600 + 300 < 1000, never negative
});

test("branch unavailable IDs control availability while global inactivity still blocks a product", () => {
    const branchOverrideDisabled = new Map(products).set(
        "burger",
        product("burger", 800, { branch_active: false }),
    );
    assert.doesNotThrow(() => priceBundle(makeOffer(), bundle(), branchOverrideDisabled, now));

    const branchUnavailable = new Map(products).set(
        "burger",
        product("burger", 800, { branch_unavailable: true }),
    );
    assert.throws(() => priceBundle(makeOffer(), bundle(), branchUnavailable, now), /not available at this branch/);

    const globallyInactive = new Map(products).set(
        "burger",
        product("burger", 800, { active: false }),
    );
    assert.throws(() => priceBundle(makeOffer(), bundle(), globallyInactive, now), /not available at this branch/);
});

test("rejects inactive, expired and unstarted offers", () => {
    assert.throws(() => priceBundle(makeOffer({ active: false }), bundle(), products, now), /not available/);
    assert.throws(() => priceBundle(makeOffer({ ends_at: new Date("2026-02-01T00:00:00Z") }), bundle(), products, now), /ended/);
    assert.throws(() => priceBundle(makeOffer({ starts_at: new Date("2026-09-01T00:00:00Z") }), bundle(), products, now), /not started/);
});

test("rejects bad picks", () => {
    // missing rule
    assert.throws(
        () => priceBundle(makeOffer(), bundle({ rules: [{ offer_rule_id: "main", items: [{ product_id: "burger" }] }] }), products, now),
        /needs a choice for 'Side'/
    );
    // wrong product count
    assert.throws(
        () =>
            priceBundle(
                makeOffer(),
                bundle({
                    rules: [
                        { offer_rule_id: "main", items: [{ product_id: "burger" }, { product_id: "burger" }] },
                        { offer_rule_id: "side", items: [{ product_id: "fries", modifier_ids: ["small"] }] },
                    ],
                }),
                products,
                now
            ),
        /exactly 1/
    );
    // product not in the rule
    assert.throws(
        () =>
            priceBundle(
                makeOffer(),
                bundle({
                    rules: [
                        { offer_rule_id: "main", items: [{ product_id: "fries" }] },
                        { offer_rule_id: "side", items: [{ product_id: "fries", modifier_ids: ["small"] }] },
                    ],
                }),
                products,
                now
            ),
        /not part of/
    );
    // required modifier group not chosen
    assert.throws(
        () =>
            priceBundle(
                makeOffer(),
                bundle({
                    rules: [
                        { offer_rule_id: "main", items: [{ product_id: "burger" }] },
                        { offer_rule_id: "side", items: [{ product_id: "fries" }] },
                    ],
                }),
                products,
                now
            ),
        /needs at least 1 from 'Size'/
    );
});

test("BUY_X_GET_Y cannot be ordered as a bundle", () => {
    assert.throws(() => priceBundle(makeOffer({ type: "BUY_X_GET_Y" }), bundle(), products, now), /automatically/);
});

test("BUY_X_GET_Y gives one free unit per full set of rule.quantity", () => {
    const base = makeOffer({ type: "BUY_X_GET_Y", price: null });
    const offer = makeOffer({
        type: "BUY_X_GET_Y",
        price: null,
        rules: [{ ...base.rules[0]!, quantity: 2 }],
    });
    const item = (quantity: number, unitPrice = 800) => ({ productId: "burger", name: "Product burger", quantity, unitPrice });

    assert.deepEqual(freeItems([offer], [item(1)], now), []);
    assert.equal(freeItems([offer], [item(2)], now)[0]?.quantity, 1);
    assert.equal(freeItems([offer], [item(5)], now)[0]?.quantity, 2);
    // units on different lines (e.g. different modifiers) are counted together, the cheapest line is given free
    const mixed = freeItems([offer], [item(1, 900), item(1, 800)], now);
    assert.equal(mixed[0]?.quantity, 1);
    // other products, inactive and out-of-window offers do nothing
    assert.deepEqual(freeItems([offer], [{ productId: "fries", name: "Fries", quantity: 4, unitPrice: 300 }], now), []);
    assert.deepEqual(freeItems([{ ...offer, active: false }], [item(2)], now), []);
    assert.deepEqual(freeItems([{ ...offer, ends_at: new Date("2026-02-01T00:00:00Z") }], [item(2)], now), []);
    assert.deepEqual(freeItems([makeOffer()], [item(2)], now), []); // not a BUY_X_GET_Y offer
});

test("an order may contain only offers, but not nothing", () => {
    assert.doesNotThrow(() => bundle());
    assert.throws(() => orderCreateSchema.parse({ branch_id: "b1", customer_name: "Jo" }));
});
