/*
    OFFER PRICING - pure functions (no database) that validate one bundle against its offer and price it.

    A bundle is one offer with the products (and modifiers) the customer picked for each rule.

    Validation
        - offer is active and inside its starts_at / ends_at window
        - every rule of the offer is answered exactly once, with exactly rule.quantity products
        - each product belongs to the rule and is available at the branch
        - modifiers come from the rule's modifier groups and respect each group's required / min / max

    Pricing (per single bundle, the caller multiplies by the bundle quantity)
        list value      = products (branch override or base price) + selected modifiers
        FIXED_PRICE     the products cost offer.price, modifiers are still charged on top
        PERCENTAGE      offer.percentage off the list value
        FIXED_DISCOUNT  offer.discount_amount off the list value (never more than the list value)
        BUY_X_GET_Y     not orderable as a bundle, see freeItems() below
    The discount is never negative and never above the list value.

    BUY_X_GET_Y works automatically on normal order items, no bundle needed:
        every rule means "buy rule.quantity of its products, get 1 more of them free".
        Each full set of rule.quantity matching units earns one free unit of the cheapest matching product.
        Free units are added to the order as items priced 0 (tagged with offer_id / offer_rule_id).
*/

import { badRequest } from "../helpers/errors";
import type { OrderOfferCreate } from "../database/schemas";
import type { OfferResponse, OfferRuleResponse, OrderPricingProductRow } from "../types";
import { resolveRemovedIngredients } from "./ingredientRemoval";

export type PricedOfferModifier = { id: string; name: string; price: number };

export type PricedOfferItem = {
    productId: string;
    ruleId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    removedIngredients: string[];
    modifiers: PricedOfferModifier[];
};

export type PricedBundle = {
    offerId: string;
    offerName: string;
    discount: number;
    items: PricedOfferItem[];
};

export type FreeItem = {
    offerId: string;
    ruleId: string;
    productId: string;
    name: string;
    quantity: number;
};

// order items that count towards BUY_X_GET_Y rules (modifiers are included in unitPrice)
export type QualifyingItem = { productId: string; name: string; quantity: number; unitPrice: number };

export const isOfferAvailable = (offer: OfferResponse, now: Date): boolean =>
    offer.active && (!offer.starts_at || offer.starts_at <= now) && (!offer.ends_at || offer.ends_at >= now);

export const freeItems = (offers: readonly OfferResponse[], items: readonly QualifyingItem[], now: Date): FreeItem[] => {
    const result: FreeItem[] = [];

    for (const offer of offers) {
        if (offer.type !== "BUY_X_GET_Y" || !isOfferAvailable(offer, now)) continue;

        for (const rule of offer.rules) {
            const allowed = new Set(rule.products.map(product => product.id));
            const matching = items.filter(item => allowed.has(item.productId));
            const units = matching.reduce((sum, item) => sum + item.quantity, 0);
            const free = Math.floor(units / rule.quantity);
            const cheapest = matching.reduce<QualifyingItem | undefined>(
                (best, item) => (!best || item.unitPrice < best.unitPrice ? item : best),
                undefined
            );

            if (free > 0 && cheapest) {
                result.push({ offerId: offer.id, ruleId: rule.id, productId: cheapest.productId, name: cheapest.name, quantity: free });
            }
        }
    }

    return result;
};

const assertAvailable = (offer: OfferResponse, now: Date): void => {
    if (!offer.active) throw badRequest(`Offer '${offer.name}' is not available`);
    if (offer.starts_at && offer.starts_at > now) throw badRequest(`Offer '${offer.name}' has not started yet`);
    if (offer.ends_at && offer.ends_at < now) throw badRequest(`Offer '${offer.name}' has ended`);
};

const resolveRuleModifiers = (
    offerName: string,
    rule: OfferRuleResponse,
    productName: string,
    selectedIds: readonly string[]
): PricedOfferModifier[] => {
    if (new Set(selectedIds).size !== selectedIds.length) {
        throw badRequest(`Duplicate modifiers selected for '${productName}' in '${offerName}'`);
    }

    const available = new Map(
        rule.modifier_groups.flatMap(group =>
            group.modifiers.filter(modifier => modifier.active).map(modifier => [modifier.id, modifier] as const)
        )
    );

    const selected = selectedIds.map(modifierId => {
        const modifier = available.get(modifierId);
        if (!modifier) throw badRequest(`Modifier ${modifierId} is not available for '${rule.name}' in '${offerName}'`);
        return modifier;
    });

    for (const group of rule.modifier_groups) {
        const hasChoices = group.modifiers.some(modifier => modifier.active);
        const count = selected.filter(modifier => modifier.modifier_group_id === group.id).length;
        const minimum = hasChoices && group.required ? Math.max(group.min_selections, 1) : group.min_selections;

        if (count < minimum) {
            throw badRequest(`'${productName}' in '${offerName}' needs at least ${minimum} from '${group.name}'`);
        }
        if (count > group.max_selections) {
            throw badRequest(`'${productName}' in '${offerName}' allows at most ${group.max_selections} from '${group.name}'`);
        }
    }

    return selected.map(({ id, name, price }) => ({ id, name, price }));
};

const requireValue = (offer: OfferResponse, value: number | null, label: string): number => {
    if (value === null) throw badRequest(`Offer '${offer.name}' has no ${label} set`);
    return value;
};

const computeDiscount = (offer: OfferResponse, productsValue: number, listValue: number): number => {
    switch (offer.type) {
        case "FIXED_PRICE":
            return Math.min(Math.max(0, productsValue - requireValue(offer, offer.price, "price")), listValue);
        case "PERCENTAGE":
            return Math.round((listValue * requireValue(offer, offer.percentage, "percentage")) / 100);
        case "FIXED_DISCOUNT":
            return Math.min(requireValue(offer, offer.discount_amount, "discount amount"), listValue);
        case "BUY_X_GET_Y":
            throw badRequest(`Offer '${offer.name}' applies automatically to normal items, it cannot be ordered as a bundle`);
    }
};

export const priceBundle = (
    offer: OfferResponse,
    bundle: OrderOfferCreate,
    products: ReadonlyMap<string, OrderPricingProductRow>,
    now: Date
): PricedBundle => {
    assertAvailable(offer, now);

    const rulesById = new Map(offer.rules.map(rule => [rule.id, rule]));
    const answeredRuleIds = bundle.rules.map(entry => entry.offer_rule_id);

    for (const ruleId of answeredRuleIds) {
        if (!rulesById.has(ruleId)) throw badRequest(`Rule ${ruleId} does not belong to offer '${offer.name}'`);
    }
    if (new Set(answeredRuleIds).size !== answeredRuleIds.length) {
        throw badRequest(`A rule is listed more than once for offer '${offer.name}'`);
    }
    for (const rule of offer.rules) {
        if (!answeredRuleIds.includes(rule.id)) throw badRequest(`Offer '${offer.name}' needs a choice for '${rule.name}'`);
    }

    const items: PricedOfferItem[] = [];
    let productsValue = 0;
    let modifiersValue = 0;

    for (const entry of bundle.rules) {
        const rule = rulesById.get(entry.offer_rule_id);
        if (!rule) continue;

        if (entry.items.length !== rule.quantity) {
            throw badRequest(`'${rule.name}' in '${offer.name}' needs exactly ${rule.quantity} product(s)`);
        }

        for (const pick of entry.items) {
            const product = products.get(pick.product_id);
            if (!product || !rule.products.some(allowed => allowed.id === pick.product_id)) {
                throw badRequest(`Product ${pick.product_id} is not part of '${rule.name}' in '${offer.name}'`);
            }
            if (!product.active || product.branch_unavailable) {
                throw badRequest(`'${product.name}' is not available at this branch`);
            }

            const modifiers = resolveRuleModifiers(offer.name, rule, product.name, pick.modifier_ids);
            const removedIngredients = resolveRemovedIngredients(
                product.name,
                pick.removed_ingredients,
                product.ingredients
            );
            const productPrice = product.price_override ?? product.price;
            const modifierPrice = modifiers.reduce((sum, modifier) => sum + modifier.price, 0);
            const unitPrice = productPrice + modifierPrice;

            productsValue += productPrice;
            modifiersValue += modifierPrice;

            items.push({
                productId: product.id,
                ruleId: rule.id,
                name: product.name,
                quantity: bundle.quantity,
                unitPrice,
                total: unitPrice * bundle.quantity,
                removedIngredients,
                modifiers,
            });
        }
    }

    const discount = computeDiscount(offer, productsValue, productsValue + modifiersValue);

    return { offerId: offer.id, offerName: offer.name, discount: discount * bundle.quantity, items };
};
