import assert from "node:assert/strict";
import test from "node:test";

import { chargeDeliveryFee } from "../src/payment/deliveryPricing";

test("pickup orders have no delivery fee", () => {
    assert.equal(chargeDeliveryFee(true, 5), 0);
});

test("delivery fee has a £3 minimum", () => {
    assert.equal(chargeDeliveryFee(false, 0), 300);
});

test("delivery fee increases by 10p for each started tenth mile beyond three miles", () => {
    assert.equal(chargeDeliveryFee(false, 5), 320);
});

test("delivery fees handle pickup, invalid distances, and the three-mile boundary safely", () => {
    for (const distance of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.equal(chargeDeliveryFee(false, distance), 300);
    }
    assert.equal(chargeDeliveryFee(true, null), 0);
    assert.equal(chargeDeliveryFee(false, 3 / 0.621371), 300);
    assert.equal(chargeDeliveryFee(false, (3 + 0.1) / 0.621371), 310);
});

test("delivery fee charges one tenth-mile increment without floating-point overcharging", () => {
    const justOverThreeMiles = (3 + 0.000000001) / 0.621371;
    assert.equal(chargeDeliveryFee(false, justOverThreeMiles), 310);
    assert.equal(chargeDeliveryFee(false, 10 / 0.621371), 1000);
});
