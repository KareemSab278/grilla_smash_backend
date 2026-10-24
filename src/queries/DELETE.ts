// BRANCHES
const deleteBranchQuery: string = `DELETE FROM branches WHERE id = $1 RETURNING id;`;
const removeBranchUnavailableProductQuery: string = `
UPDATE branches
SET unavailable_products = array_remove(unavailable_products, $2)
WHERE id = $1
RETURNING *;
`;

// CATEGORIES
const deleteCategoryQuery: string = `DELETE FROM categories WHERE id = $1 RETURNING id;`;

// PRODUCTS
const deleteProductQuery: string = `DELETE FROM products WHERE id = $1 RETURNING id;`;
const unlinkProductCategoriesQuery: string = `DELETE FROM product_categories WHERE product_id = $1;`;

// MODIFIER GROUPS
const deleteModifierGroupQuery: string = `DELETE FROM modifier_groups WHERE id = $1 RETURNING id;`;

// MODIFIERS
const deleteModifierQuery: string = `DELETE FROM modifiers WHERE id = $1 RETURNING id;`;

// PRODUCT <-> MODIFIER GROUP
const detachModifierGroupQuery: string = `
DELETE FROM product_modifier_groups
WHERE product_id = $1
  AND modifier_group_id = $2;
`;

// BRANCH PRODUCT OVERRIDES
const deleteBranchProductOverrideQuery: string = `
DELETE FROM branch_product_overrides
WHERE branch_id = $1
  AND product_id = $2;
`;

// OFFERS
const deleteOfferQuery: string = `DELETE FROM offers WHERE id = $1 RETURNING id;`;
const deleteOfferRulesQuery: string = `DELETE FROM offer_rules WHERE offer_id = $1;`;

export const DELETE = {
    BRANCH: deleteBranchQuery,
    BRANCH_UNAVAILABLE_PRODUCT: removeBranchUnavailableProductQuery,
    CATEGORY: deleteCategoryQuery,
    PRODUCT: deleteProductQuery,
    PRODUCT_CATEGORIES: unlinkProductCategoriesQuery,
    MODIFIER_GROUP: deleteModifierGroupQuery,
    MODIFIER: deleteModifierQuery,
    PRODUCT_MODIFIER_GROUP: detachModifierGroupQuery,
    BRANCH_PRODUCT_OVERRIDE: deleteBranchProductOverrideQuery,
    OFFER: deleteOfferQuery,
    OFFER_RULES: deleteOfferRulesQuery,
};