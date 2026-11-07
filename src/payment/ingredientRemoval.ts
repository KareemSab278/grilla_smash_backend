import { badRequest } from "../helpers/errors";

export const resolveRemovedIngredients = (
    productName: string,
    requested: readonly string[],
    available: readonly string[]
): string[] => {
    const availableIngredients = new Set(available);
    const seen = new Set<string>();

    return requested.map(ingredient => {
        if (seen.has(ingredient)) {
            throw badRequest(`Duplicate removed ingredient '${ingredient}' for '${productName}'`);
        }
        seen.add(ingredient);

        if (!availableIngredients.has(ingredient)) {
            throw badRequest(`Ingredient '${ingredient}' cannot be removed from '${productName}'`);
        }

        return ingredient;
    });
};
