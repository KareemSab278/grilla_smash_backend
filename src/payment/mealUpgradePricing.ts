import { badRequest } from "../helpers/errors";
import type { OrderPricingProductRow } from "../types";

export type MealUpgradeChoice = {
    id: string;
    product_id: string;
    surcharge: number;
    active: boolean;
};

export type MealUpgradeGroup = {
    id: string;
    name: string;
    min_selections: number;
    max_selections: number;
    choices: MealUpgradeChoice[];
};

export type MealUpgradeConfiguration = {
    id: string;
    name: string;
    price: number;
    active: boolean;
    main_product_ids: string[];
    groups: MealUpgradeGroup[];
};

export type MealUpgradeSnapshot = {
    id: string;
    name: string;
    price: number;
    choices: {
        id: string;
        group_id: string;
        group_name: string;
        product_id: string;
        product_name: string;
        surcharge: number;
    }[];
};

export const priceMealUpgrade = (
    upgrade: MealUpgradeConfiguration,
    mainProductId: string,
    choiceIds: readonly string[],
    products: ReadonlyMap<string, OrderPricingProductRow>
): { snapshot: MealUpgradeSnapshot; price: number } => {
    if (!upgrade.active || !upgrade.main_product_ids.includes(mainProductId)) {
        throw badRequest(`Meal upgrade '${upgrade.name}' is not available for this product`);
    }
    if (new Set(choiceIds).size !== choiceIds.length) {
        throw badRequest(`Duplicate choices selected for '${upgrade.name}'`);
    }
    if (upgrade.groups.length === 0) {
        throw badRequest(`Meal upgrade '${upgrade.name}' has no choice groups`);
    }

    const choicesById = new Map(upgrade.groups.flatMap(group =>
        group.choices.map(choice => [choice.id, { group, choice }] as const)
    ));
    const selected = choiceIds.map(id => {
        const entry = choicesById.get(id);
        if (!entry || !entry.choice.active) {
            throw badRequest(`Choice ${id} is not available for '${upgrade.name}'`);
        }
        const product = products.get(entry.choice.product_id);
        if (!product || !product.active || product.branch_unavailable || product.branch_active === false) {
            throw badRequest(`Choice ${id} is not available at this branch`);
        }
        return { ...entry, product };
    });

    for (const group of upgrade.groups) {
        const count = selected.filter(entry => entry.group.id === group.id).length;
        if (count < group.min_selections || count > group.max_selections) {
            throw badRequest(`'${group.name}' requires ${group.min_selections} to ${group.max_selections} choices`);
        }
    }

    const snapshot: MealUpgradeSnapshot = {
        id: upgrade.id,
        name: upgrade.name,
        price: upgrade.price,
        choices: selected.map(({ group, choice, product }) => ({
            id: choice.id,
            group_id: group.id,
            group_name: group.name,
            product_id: product.id,
            product_name: product.name,
            surcharge: choice.surcharge,
        })),
    };

    return {
        snapshot,
        price: upgrade.price + snapshot.choices.reduce((sum, choice) => sum + choice.surcharge, 0),
    };
};
