import assert from "node:assert/strict";
import test from "node:test";
import { priceMealUpgrade } from "../src/payment/mealUpgradePricing";
import type { MealUpgradeConfiguration } from "../src/payment/mealUpgradePricing";
import type { OrderPricingProductRow } from "../src/types";

const product = (id: string, changes: Partial<OrderPricingProductRow> = {}): OrderPricingProductRow => ({
    id, name: id, active: true, price: 9999, ingredients: [], hidden: false,
    branch_active: null, price_override: null, branch_unavailable: false, ...changes,
});
const upgrade = (): MealUpgradeConfiguration => ({
    id: "meal", name: "Meal", price: 250, active: true, main_product_ids: ["burger"],
    groups: [
        { id: "side", name: "Side", min_selections: 1, max_selections: 1, choices: [
            { id: "fries", product_id: "fries", surcharge: 0, active: true },
            { id: "premium", product_id: "premium", surcharge: 75, active: true },
        ] },
        { id: "drink", name: "Drink", min_selections: 1, max_selections: 1, choices: [
            { id: "cola", product_id: "cola", surcharge: 0, active: true },
        ] },
    ],
});
const products = () => new Map(["fries", "premium", "cola"].map(id => [id, product(id)]));

test("meal upgrade charges only its fixed price and selected surcharges", () => {
    const normal = priceMealUpgrade(upgrade(), "burger", ["fries", "cola"], products());
    const premium = priceMealUpgrade(upgrade(), "burger", ["premium", "cola"], products());
    assert.equal(normal.price, 250);
    assert.equal(premium.price, 325);
    assert.equal(800 + premium.price, 1125);
    assert.deepEqual(premium.snapshot.choices[0], {
        id: "premium", group_id: "side", group_name: "Side", product_id: "premium",
        product_name: "premium", surcharge: 75,
    });
});

test("the snapshot is not changed by subsequent menu edits", () => {
    const config = upgrade();
    const available = products();
    const result = priceMealUpgrade(config, "burger", ["fries", "cola"], available);
    config.name = "Renamed";
    config.price = 500;
    config.groups[0]!.name = "New side";
    config.groups[0]!.choices[0]!.surcharge = 50;
    available.get("fries")!.name = "New fries";
    assert.equal(result.snapshot.name, "Meal");
    assert.equal(result.snapshot.price, 250);
    assert.equal(result.snapshot.choices[0]?.group_name, "Side");
    assert.equal(result.snapshot.choices[0]?.product_name, "fries");
    assert.equal(result.snapshot.choices[0]?.surcharge, 0);
});

test("meal upgrade rejects inactive or ineligible upgrades and invalid selections", () => {
    assert.throws(() => priceMealUpgrade({ ...upgrade(), active: false }, "burger", ["fries", "cola"], products()));
    assert.throws(() => priceMealUpgrade(upgrade(), "other", ["fries", "cola"], products()));
    assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["fries"], products()));
    assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["fries", "premium", "cola"], products()));
    assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["fries", "fries", "cola"], products()));
    assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["unknown", "cola"], products()));
    const inactive = upgrade();
    inactive.groups[0]!.choices[0]!.active = false;
    assert.throws(() => priceMealUpgrade(inactive, "burger", ["fries", "cola"], products()));
    assert.throws(() => priceMealUpgrade({ ...upgrade(), groups: [] }, "burger", [], products()));
});

test("meal upgrade rejects unavailable choice products", () => {
    for (const changes of [{ active: false }, { branch_unavailable: true }, { branch_active: false }]) {
        const available = products();
        available.set("fries", product("fries", changes));
        assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["fries", "cola"], available));
    }
    const missing = products();
    missing.delete("fries");
    assert.throws(() => priceMealUpgrade(upgrade(), "burger", ["fries", "cola"], missing));
});
