import assert from "node:assert/strict";
import test from "node:test";

import { resolveRemovedIngredients } from "../src/payment/ingredientRemoval";

test("resolveRemovedIngredients accepts only product ingredients", () => {
    assert.deepEqual(resolveRemovedIngredients("Burger", ["Lettuce"], ["Lettuce", "Tomato"]), ["Lettuce"]);
    assert.deepEqual(resolveRemovedIngredients("Burger", [], ["Lettuce"]), []);
    assert.throws(
        () => resolveRemovedIngredients("Burger", ["Pickles"], ["Lettuce", "Tomato"]),
        /cannot be removed/
    );
    assert.throws(
        () => resolveRemovedIngredients("Burger", ["Lettuce", "Lettuce"], ["Lettuce"]),
        /Duplicate removed ingredient/
    );
});
