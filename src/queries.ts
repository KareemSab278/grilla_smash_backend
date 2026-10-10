/*
    ALL SQL LIVES HERE - EVERY QUERY IS STATIC, NEVER BUILD SQL FROM USER INPUT.

    Grouped by HTTP verb (GET / POST / PUT / PATCH / DELETE) in the QUERIES object at the bottom.
    Values are always bound as $1, $2... parameters.

    UPDATE queries use COALESCE($n, column) so a null param means "leave this column alone".
    updated_at is maintained by a trigger (see schema.txt).
    Queries taking an optional parent id use ($1::text IS NULL OR parent_id = $1) so the same statement
    serves both "list everything" and "just this one" (lets us batch child rows instead of N+1).
    Writes that return RETURNING * / RETURNING id give back no row when the id does not exist (-> 404).
*/

// ========================================
// BUSINESS
// ========================================

const getBusinessQuery: string = `SELECT * FROM business LIMIT 1;`;

const getBusinessByIdQuery: string = `SELECT * FROM business WHERE id = $1;`;

const getBusinessIdQuery: string = `SELECT id FROM business LIMIT 1;`;

const createBusinessQuery: string = `
INSERT INTO business (id, name, slug, logo_url, currency)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
`;

const updateBusinessQuery: string = `
UPDATE business
SET
    name = COALESCE($1, name),
    slug = COALESCE($2, slug),
    logo_url = COALESCE($3, logo_url),
    currency = COALESCE($4, currency),
    active = COALESCE($5, active)
WHERE id = $6
RETURNING *;
`;

// ========================================
// BRANCHES
// ========================================

const getBranchesQuery: string = `SELECT * FROM branches ORDER BY name;`;

const getBranchByIdQuery: string = `SELECT * FROM branches WHERE id = $1;`;

const createBranchQuery: string = `
INSERT INTO branches (
    id,
    name,
    address_line1,
    address_line2,
    city,
    postcode,
    phone,
    latitude,
    longitude
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;
`;

const updateBranchQuery: string = `
UPDATE branches
SET
    name = COALESCE($1, name),
    address_line1 = COALESCE($2, address_line1),
    address_line2 = COALESCE($3, address_line2),
    city = COALESCE($4, city),
    postcode = COALESCE($5, postcode),
    phone = COALESCE($6, phone),
    latitude = COALESCE($7, latitude),
    longitude = COALESCE($8, longitude),
    active = COALESCE($9, active)
WHERE id = $10
RETURNING *;
`;

const deleteBranchQuery: string = `DELETE FROM branches WHERE id = $1 RETURNING id;`;

// ========================================
// CATEGORIES
// ========================================

const getCategoriesQuery: string = `SELECT * FROM categories ORDER BY sort_order, name;`;

const getCategoryByIdQuery: string = `SELECT * FROM categories WHERE id = $1;`;

const createCategoryQuery: string = `
INSERT INTO categories (id, name, description, image_url, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
`;

const updateCategoryQuery: string = `
UPDATE categories
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    image_url = COALESCE($3, image_url),
    sort_order = COALESCE($4, sort_order),
    active = COALESCE($5, active)
WHERE id = $6
RETURNING *;
`;

const deleteCategoryQuery: string = `DELETE FROM categories WHERE id = $1 RETURNING id;`;

// ========================================
// PRODUCTS
// ========================================

const getProductsQuery: string = `SELECT * FROM products ORDER BY sort_order, name;`;

const getActiveProductsQuery: string = `SELECT * FROM products WHERE active ORDER BY sort_order, name;`;

const getProductByIdQuery: string = `SELECT * FROM products WHERE id = $1;`;

const getProductCategoriesQuery: string = `
SELECT c.*, pc.product_id
FROM categories c
JOIN product_categories pc
    ON pc.category_id = c.id
WHERE ($1::text IS NULL OR pc.product_id = $1)
ORDER BY c.sort_order, c.name;
`;

const createProductQuery: string = `
INSERT INTO products (id, name, description, price, image_url, sort_order)
VALUES ($1, $2, $3, $4, $5, $6);
`;

const updateProductQuery: string = `
UPDATE products
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    price = COALESCE($3, price),
    image_url = COALESCE($4, image_url),
    sort_order = COALESCE($5, sort_order),
    active = COALESCE($6, active)
WHERE id = $7
RETURNING id;
`;

const deleteProductQuery: string = `DELETE FROM products WHERE id = $1 RETURNING id;`;

const linkProductCategoryQuery: string = `
INSERT INTO product_categories (product_id, category_id)
VALUES ($1, $2);
`;

const unlinkProductCategoriesQuery: string = `DELETE FROM product_categories WHERE product_id = $1;`;

// ========================================
// MODIFIER GROUPS
// ========================================

const getModifierGroupsQuery: string = `SELECT * FROM modifier_groups ORDER BY sort_order, name;`;

const getModifierGroupByIdQuery: string = `SELECT * FROM modifier_groups WHERE id = $1;`;

const lockModifierGroupQuery: string = `SELECT * FROM modifier_groups WHERE id = $1 FOR UPDATE;`;

const getModifiersByGroupQuery: string = `
SELECT *
FROM modifiers
WHERE ($1::text IS NULL OR modifier_group_id = $1)
ORDER BY sort_order, name;
`;

const createModifierGroupQuery: string = `
INSERT INTO modifier_groups (id, name, required, min_selections, max_selections, sort_order)
VALUES ($1, $2, $3, $4, $5, $6);
`;

const updateModifierGroupQuery: string = `
UPDATE modifier_groups
SET
    name = COALESCE($1, name),
    required = COALESCE($2, required),
    min_selections = $3,
    max_selections = $4,
    sort_order = COALESCE($5, sort_order),
    active = COALESCE($6, active)
WHERE id = $7
RETURNING id;
`;

const deleteModifierGroupQuery: string = `DELETE FROM modifier_groups WHERE id = $1 RETURNING id;`;

// ========================================
// MODIFIERS
// ========================================

const getModifierByIdQuery: string = `SELECT * FROM modifiers WHERE id = $1;`;

const createModifierQuery: string = `
INSERT INTO modifiers (id, modifier_group_id, name, price, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
`;

const updateModifierQuery: string = `
UPDATE modifiers
SET
    name = COALESCE($1, name),
    price = COALESCE($2, price),
    sort_order = COALESCE($3, sort_order),
    active = COALESCE($4, active)
WHERE id = $5
RETURNING *;
`;

const deleteModifierQuery: string = `DELETE FROM modifiers WHERE id = $1 RETURNING id;`;

// ========================================
// PRODUCT <-> MODIFIER GROUP
// ========================================

const getProductModifierGroupsQuery: string = `
SELECT mg.*
FROM modifier_groups mg
JOIN product_modifier_groups pmg
    ON pmg.modifier_group_id = mg.id
WHERE pmg.product_id = $1
ORDER BY pmg.sort_order, mg.name;
`;

const getProductActiveModifiersQuery: string = `
SELECT m.*
FROM modifiers m
JOIN product_modifier_groups pmg
    ON pmg.modifier_group_id = m.modifier_group_id
WHERE pmg.product_id = $1
  AND m.active
ORDER BY m.sort_order, m.name;
`;

const attachModifierGroupQuery: string = `
INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order)
VALUES ($1, $2, $3)
ON CONFLICT (product_id, modifier_group_id)
DO UPDATE SET sort_order = EXCLUDED.sort_order;
`;

const detachModifierGroupQuery: string = `
DELETE FROM product_modifier_groups
WHERE product_id = $1
  AND modifier_group_id = $2;
`;

// ========================================
// BRANCH PRODUCT OVERRIDES
// ========================================

const getBranchProductsQuery: string = `
SELECT
    p.*,
    bpo.active AS branch_active,
    bpo.price_override
FROM products p
LEFT JOIN branch_product_overrides bpo
    ON bpo.product_id = p.id
    AND bpo.branch_id = $1
WHERE p.active
  AND (bpo.active IS NULL OR bpo.active)
ORDER BY p.sort_order, p.name;
`;

const setBranchProductOverrideQuery: string = `
INSERT INTO branch_product_overrides (branch_id, product_id, active, price_override)
VALUES ($1, $2, $3, $4)
ON CONFLICT (branch_id, product_id)
DO UPDATE SET active = EXCLUDED.active, price_override = EXCLUDED.price_override
RETURNING *;
`;

const deleteBranchProductOverrideQuery: string = `
DELETE FROM branch_product_overrides
WHERE branch_id = $1
  AND product_id = $2;
`;

// ========================================
// OFFERS
// ========================================

const getOffersQuery: string = `SELECT * FROM offers ORDER BY sort_order, name;`;

const getOfferByIdQuery: string = `SELECT * FROM offers WHERE id = $1;`;

const getOfferRulesQuery: string = `
SELECT *
FROM offer_rules
WHERE ($1::text IS NULL OR offer_id = $1)
ORDER BY sort_order, name;
`;

const getOfferRuleProductsQuery: string = `
SELECT p.*, orp.offer_rule_id
FROM offer_rule_products orp
JOIN offer_rules r
    ON r.id = orp.offer_rule_id
JOIN products p
    ON p.id = orp.product_id
WHERE ($1::text IS NULL OR r.offer_id = $1)
ORDER BY p.sort_order, p.name;
`;

const getOfferRuleGroupsQuery: string = `
SELECT
    mg.*,
    org.offer_rule_id,
    org.required AS offer_required,
    org.min_selections AS offer_min_selections,
    org.max_selections AS offer_max_selections
FROM offer_rule_modifier_groups org
JOIN offer_rules r
    ON r.id = org.offer_rule_id
JOIN modifier_groups mg
    ON mg.id = org.modifier_group_id
WHERE ($1::text IS NULL OR r.offer_id = $1)
ORDER BY mg.name;
`;

const getOfferRuleModifiersQuery: string = `
SELECT m.*, orm.offer_rule_id
FROM offer_rule_modifiers orm
JOIN offer_rules r
    ON r.id = orm.offer_rule_id
JOIN modifiers m
    ON m.id = orm.modifier_id
    AND m.modifier_group_id = orm.modifier_group_id
WHERE ($1::text IS NULL OR r.offer_id = $1)
ORDER BY m.sort_order, m.name;
`;

const getActiveModifiersByGroupsQuery: string = `
SELECT *
FROM modifiers
WHERE active
  AND modifier_group_id = ANY($1::text[])
ORDER BY sort_order, name;
`;

const createOfferQuery: string = `
INSERT INTO offers (
    id,
    name,
    description,
    type,
    price,
    percentage,
    discount_amount,
    starts_at,
    ends_at,
    sort_order,
    active
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
`;

const updateOfferQuery: string = `
UPDATE offers
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    type = COALESCE($3, type),
    price = COALESCE($4, price),
    percentage = COALESCE($5, percentage),
    discount_amount = COALESCE($6, discount_amount),
    starts_at = COALESCE($7, starts_at),
    ends_at = COALESCE($8, ends_at),
    sort_order = COALESCE($9, sort_order),
    active = COALESCE($10, active)
WHERE id = $11
RETURNING id;
`;

const deleteOfferQuery: string = `DELETE FROM offers WHERE id = $1 RETURNING id;`;

const deleteOfferRulesQuery: string = `DELETE FROM offer_rules WHERE offer_id = $1;`;

const createOfferRuleQuery: string = `
INSERT INTO offer_rules (id, offer_id, name, quantity, sort_order)
VALUES ($1, $2, $3, $4, $5);
`;

const createOfferRuleProductQuery: string = `
INSERT INTO offer_rule_products (offer_rule_id, product_id)
VALUES ($1, $2);
`;

const createOfferRuleGroupQuery: string = `
INSERT INTO offer_rule_modifier_groups (offer_rule_id, modifier_group_id, required, min_selections, max_selections)
VALUES ($1, $2, $3, $4, $5);
`;

const createOfferRuleModifierQuery: string = `
INSERT INTO offer_rule_modifiers (offer_rule_id, modifier_group_id, modifier_id)
VALUES ($1, $2, $3);
`;

// ========================================
// ORDERS
// ========================================

// serialises order-number allocation per branch for the rest of the transaction
const lockBranchOrdersQuery: string = `SELECT pg_advisory_xact_lock(hashtext($1));`;

const getNextOrderNumberQuery: string = `
SELECT COALESCE(MAX(order_number), 0) + 1 AS next_number
FROM orders
WHERE branch_id = $1;
`;

const getActiveOrdersQuery: string = `
SELECT *
FROM orders
WHERE branch_id = $1
  AND status = ANY($2::text[])
ORDER BY created_at DESC;
`;

const getOrderHistoryQuery: string = `
SELECT *
FROM orders
WHERE branch_id = $1
  AND created_at >= NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
`;

const getOrderItemsQuery: string = `
SELECT *
FROM order_items
WHERE order_id = ANY($1::text[])
ORDER BY name, id;
`;

const getOrderItemModifiersQuery: string = `
SELECT *
FROM order_item_modifiers
WHERE order_item_id = ANY($1::text[])
ORDER BY name, id;
`;

const getOrderPricingProductsQuery: string = `
SELECT
    p.id,
    p.name,
    p.active,
    p.price,
    bpo.active AS branch_active,
    bpo.price_override
FROM products p
LEFT JOIN branch_product_overrides bpo
    ON bpo.product_id = p.id
    AND bpo.branch_id = $1
WHERE p.id = ANY($2::text[]);
`;

const getOrderPricingGroupsQuery: string = `
SELECT
    pmg.product_id,
    mg.id,
    mg.name,
    mg.required,
    mg.min_selections,
    mg.max_selections
FROM product_modifier_groups pmg
JOIN modifier_groups mg
    ON mg.id = pmg.modifier_group_id
WHERE mg.active
  AND pmg.product_id = ANY($1::text[]);
`;

const getOrderPricingModifiersQuery: string = `
SELECT
    pmg.product_id,
    m.id,
    m.modifier_group_id,
    m.name,
    m.price
FROM product_modifier_groups pmg
JOIN modifiers m
    ON m.modifier_group_id = pmg.modifier_group_id
WHERE m.active
  AND pmg.product_id = ANY($1::text[]);
`;

const createOrderQuery: string = `
INSERT INTO orders (
    id,
    branch_id,
    order_number,
    order_type,
    customer_name,
    customer_phone,
    customer_email,
    address_line1,
    address_line2,
    city,
    postcode,
    subtotal,
    delivery_fee,
    discount,
    total,
    notes
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
RETURNING *;
`;

const createOrderItemQuery: string = `
INSERT INTO order_items (id, order_id, product_id, offer_id, offer_rule_id, name, quantity, unit_price, total, notes)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
`;

const createOrderOfferQuery: string = `
INSERT INTO order_offers (id, order_id, offer_id, name, discount)
VALUES ($1, $2, $3, $4, $5);
`;

const createOrderItemModifierQuery: string = `
INSERT INTO order_item_modifiers (id, order_item_id, modifier_id, name, price, quantity)
VALUES ($1, $2, $3, $4, $5, 1);
`;

const createPaymentQuery: string = `
INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, status)
VALUES ($1, $2, $3, $4, $5, 'PENDING');
`;

const updateOrderStatusQuery: string = `
UPDATE orders
SET status = $2
WHERE id = $1
RETURNING id, status;
`;

export const QUERIES = {
    GET: {
        BUSINESS: getBusinessQuery,
        BUSINESS_BY_ID: getBusinessByIdQuery,
        BUSINESS_ID: getBusinessIdQuery,

        BRANCHES: getBranchesQuery,
        BRANCH_BY_ID: getBranchByIdQuery,
        BRANCH_PRODUCTS: getBranchProductsQuery,

        CATEGORIES: getCategoriesQuery,
        CATEGORY_BY_ID: getCategoryByIdQuery,

        PRODUCTS: getProductsQuery,
        ACTIVE_PRODUCTS: getActiveProductsQuery,
        PRODUCT_BY_ID: getProductByIdQuery,
        PRODUCT_CATEGORIES: getProductCategoriesQuery,
        PRODUCT_MODIFIER_GROUPS: getProductModifierGroupsQuery,
        PRODUCT_ACTIVE_MODIFIERS: getProductActiveModifiersQuery,

        MODIFIER_GROUPS: getModifierGroupsQuery,
        MODIFIER_GROUP_BY_ID: getModifierGroupByIdQuery,
        MODIFIER_GROUP_FOR_UPDATE: lockModifierGroupQuery,
        MODIFIERS_BY_GROUP: getModifiersByGroupQuery,
        MODIFIER_BY_ID: getModifierByIdQuery,

        OFFERS: getOffersQuery,
        OFFER_BY_ID: getOfferByIdQuery,
        OFFER_RULES: getOfferRulesQuery,
        OFFER_RULE_PRODUCTS: getOfferRuleProductsQuery,
        OFFER_RULE_GROUPS: getOfferRuleGroupsQuery,
        OFFER_RULE_MODIFIERS: getOfferRuleModifiersQuery,
        ACTIVE_MODIFIERS_BY_GROUPS: getActiveModifiersByGroupsQuery,

        NEXT_ORDER_NUMBER: getNextOrderNumberQuery,
        ACTIVE_ORDERS: getActiveOrdersQuery,
        ORDER_HISTORY: getOrderHistoryQuery,
        ORDER_ITEMS: getOrderItemsQuery,
        ORDER_ITEM_MODIFIERS: getOrderItemModifiersQuery,
        ORDER_PRICING_PRODUCTS: getOrderPricingProductsQuery,
        ORDER_PRICING_GROUPS: getOrderPricingGroupsQuery,
        ORDER_PRICING_MODIFIERS: getOrderPricingModifiersQuery,
    },

    POST: {
        BUSINESS: createBusinessQuery,
        BRANCH: createBranchQuery,
        CATEGORY: createCategoryQuery,
        PRODUCT: createProductQuery,
        PRODUCT_CATEGORY: linkProductCategoryQuery,
        MODIFIER_GROUP: createModifierGroupQuery,
        MODIFIER: createModifierQuery,
        OFFER: createOfferQuery,
        OFFER_RULE: createOfferRuleQuery,
        OFFER_RULE_PRODUCT: createOfferRuleProductQuery,
        OFFER_RULE_GROUP: createOfferRuleGroupQuery,
        OFFER_RULE_MODIFIER: createOfferRuleModifierQuery,
        LOCK_BRANCH_ORDERS: lockBranchOrdersQuery,
        ORDER: createOrderQuery,
        ORDER_ITEM: createOrderItemQuery,
        ORDER_OFFER: createOrderOfferQuery,
        ORDER_ITEM_MODIFIER: createOrderItemModifierQuery,
        PAYMENT: createPaymentQuery,
    },

    PUT: {
        BUSINESS: updateBusinessQuery,
        BRANCH: updateBranchQuery,
        CATEGORY: updateCategoryQuery,
        PRODUCT: updateProductQuery,
        MODIFIER_GROUP: updateModifierGroupQuery,
        MODIFIER: updateModifierQuery,
        OFFER: updateOfferQuery,
        PRODUCT_MODIFIER_GROUP: attachModifierGroupQuery,
        BRANCH_PRODUCT_OVERRIDE: setBranchProductOverrideQuery,
    },

    PATCH: {
        ORDER_STATUS: updateOrderStatusQuery,
    },

    DELETE: {
        BRANCH: deleteBranchQuery,
        CATEGORY: deleteCategoryQuery,
        PRODUCT: deleteProductQuery,
        PRODUCT_CATEGORIES: unlinkProductCategoriesQuery,
        MODIFIER_GROUP: deleteModifierGroupQuery,
        MODIFIER: deleteModifierQuery,
        PRODUCT_MODIFIER_GROUP: detachModifierGroupQuery,
        BRANCH_PRODUCT_OVERRIDE: deleteBranchProductOverrideQuery,
        OFFER: deleteOfferQuery,
        OFFER_RULES: deleteOfferRulesQuery,
    },
};
