// BUSINESS
const BUSINESS_COLUMNS = "id, name, slug, logo_url, currency, active, created_at, updated_at";

const getBusinessQuery: string = `SELECT ${BUSINESS_COLUMNS} FROM business LIMIT 1;`;

const getBranchLocationsQuery: string = `SELECT * FROM branches where active = true`;

const getBusinessByIdQuery: string = `SELECT ${BUSINESS_COLUMNS} FROM business WHERE id = $1;`;

const getBusinessIdQuery: string = `SELECT id FROM business LIMIT 1;`;

const getBusinessKeyHashQuery: string = `SELECT key_hash FROM business LIMIT 1;`;



// USERS
const getUserByIdQuery: string = `SELECT * FROM users WHERE id = $1;`;

const getUserByEmailQuery: string = `SELECT * FROM users WHERE lower(email) = lower($1);`;

const getUserByUsernameQuery: string = `SELECT * FROM users WHERE username = $1;`;

const getAdminEmailsQuery: string = `
SELECT DISTINCT email
FROM users
WHERE role = 'ADMIN' AND active AND email IS NOT NULL
ORDER BY email;
`;


// BRANCHES
const getBranchesQuery: string = `SELECT * FROM branches ORDER BY name;`;
const getBranchPurgeHoursQuery: string = `SELECT id, opening_hours::text AS opening_hours FROM branches ORDER BY id;`;

const getBranchByIdQuery: string = `SELECT * FROM branches WHERE id = $1;`;

const getActiveBranchByKeyQuery: string = `
SELECT id FROM branches
WHERE branch_key = $1 AND active = TRUE
LIMIT 1;
`;

const getActiveKdsNotificationsQuery: string = `
SELECT id, expo_push_token
FROM kds_notifications
WHERE branch_id = $1 AND active = TRUE;
`;


// BRANCH PRODUCTS OVERRIDES
const getBranchProductsQuery: string = `
SELECT
    p.*,
    bpo.active AS branch_active,
    bpo.price_override
FROM products p
JOIN branches b
    ON b.id = $1
LEFT JOIN branch_product_overrides bpo
    ON bpo.product_id = p.id
    AND bpo.branch_id = $1
WHERE p.active
  AND (NOT p.hidden OR $2)
  AND NOT (p.id = ANY(b.unavailable_products))
ORDER BY p.sort_order, p.name;
`;


// OFFERS
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
    AND p.active
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


// CATEGORIES
const getCategoriesQuery: string = `SELECT * FROM categories ORDER BY sort_order, name;`;
const getCategoryByIdQuery: string = `SELECT * FROM categories WHERE id = $1;`;
const lockCategoryImageQuery: string = `SELECT image_url FROM categories WHERE id = $1 FOR UPDATE;`;


// MODIFIER GROUPS
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

const getModifierByIdQuery: string = `SELECT * FROM modifiers WHERE id = $1;`;

const getModifierGroupsQuery: string = `SELECT * FROM modifier_groups ORDER BY sort_order, name;`;

const getModifierGroupByIdQuery: string = `SELECT * FROM modifier_groups WHERE id = $1;`;

const lockModifierGroupQuery: string = `SELECT * FROM modifier_groups WHERE id = $1 FOR UPDATE;`;

const getModifiersByGroupQuery: string = `
SELECT *
FROM modifiers
WHERE ($1::text IS NULL OR modifier_group_id = $1)
ORDER BY sort_order, name;
`;


// PRODUCTS

const getProductsQuery: string = `SELECT * FROM products ORDER BY sort_order, name;`;

const getActiveProductsQuery: string = `
SELECT *
FROM products
WHERE active
  AND (NOT hidden OR $1)
ORDER BY sort_order, name;
`;

const getProductByIdQuery: string = `SELECT * FROM products WHERE id = $1;`;
const getProductIdsQuery: string = `SELECT id FROM products WHERE id = ANY($1::text[]);`;
const lockProductImageQuery: string = `SELECT image_url FROM products WHERE id = $1 FOR UPDATE;`;

const getProductCategoriesQuery: string = `
SELECT c.*, pc.product_id
FROM categories c
JOIN product_categories pc
    ON pc.category_id = c.id
WHERE ($1::text IS NULL OR pc.product_id = $1)
ORDER BY c.sort_order, c.name;
`;


// ORDERS
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
    p.ingredients,
    p.hidden,
    bpo.active AS branch_active,
    bpo.price_override,
    COALESCE(b.unavailable_products, '{}'::text[]) @> ARRAY[p.id] AS branch_unavailable
FROM products p
JOIN branches b
    ON b.id = $1
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

const getOrderByIdQuery: string = `SELECT * FROM orders WHERE id = $1;`;

const getOrderEmailTargetQuery: string = `SELECT order_number, customer_email FROM orders WHERE id = $1;`;


export const GET = {
        BUSINESS: getBusinessQuery,
        BRANCH_LOCATIONS: getBranchLocationsQuery,
        USER_BY_ID: getUserByIdQuery,
        USER_BY_EMAIL: getUserByEmailQuery,
        USER_BY_USERNAME: getUserByUsernameQuery,
        ADMIN_EMAILS: getAdminEmailsQuery,
        BUSINESS_BY_ID: getBusinessByIdQuery,
        BUSINESS_ID: getBusinessIdQuery,
        BUSINESS_KEY_HASH: getBusinessKeyHashQuery,

        BRANCHES: getBranchesQuery,
        BRANCH_PURGE_HOURS: getBranchPurgeHoursQuery,
        BRANCH_BY_ID: getBranchByIdQuery,
        ACTIVE_BRANCH_BY_KEY: getActiveBranchByKeyQuery,
        ACTIVE_KDS_NOTIFICATIONS: getActiveKdsNotificationsQuery,
        BRANCH_PRODUCTS: getBranchProductsQuery,

        CATEGORIES: getCategoriesQuery,
        CATEGORY_BY_ID: getCategoryByIdQuery,
        CATEGORY_IMAGE_FOR_UPDATE: lockCategoryImageQuery,

        PRODUCTS: getProductsQuery,
        ACTIVE_PRODUCTS: getActiveProductsQuery,
        PRODUCT_BY_ID: getProductByIdQuery,
        PRODUCT_IDS: getProductIdsQuery,
        PRODUCT_IMAGE_FOR_UPDATE: lockProductImageQuery,
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
        ORDER_BY_ID: getOrderByIdQuery,
        ORDER_EMAIL_TARGET: getOrderEmailTargetQuery,
        LOCK_BRANCH_ORDERS: lockBranchOrdersQuery,
    }