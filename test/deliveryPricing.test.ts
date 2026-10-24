import assert from "node:assert/strict";
import test from "node:test";

import { chargeDeliveryFee } from "../src/deliveryPricing";

test("pickup orders have no delivery fee", () => {
    assert.equal(chargeDeliveryFee(true, 5), 0);
});

test("delivery fee has a £3 minimum", () => {
    assert.equal(chargeDeliveryFee(false, 0), 300);
});

test("delivery fee increases by 10p for each started tenth mile beyond three miles", () => {
    assert.equal(chargeDeliveryFee(false, 5), 320);
});
