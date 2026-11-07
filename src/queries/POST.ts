// BUSINESS
const BUSINESS_COLUMNS = "id, name, slug, logo_url, currency, active, created_at, updated_at";

const createBusinessQuery: string = `
INSERT INTO business (id, name, slug, logo_url, currency, key_hash)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING ${BUSINESS_COLUMNS};
`;

// USERS
const USER_PUBLIC_COLUMNS = "id, username, email, role, active, created_at, updated_at";

const createUserQuery: string = `
INSERT INTO users (id, username, password_hash, email, role)
VALUES ($1, $2, $3, $4, $5)
RETURNING ${USER_PUBLIC_COLUMNS};
`;

// BRANCHES
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
    longitude,
    opening_hours,
    unavailable_products
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    COALESCE($10::jsonb, '{"monday":{"open":"09:00","close":"17:00","is_closed":false},"tuesday":{"open":"09:00","close":"17:00","is_closed":false},"wednesday":{"open":"09:00","close":"17:00","is_closed":false},"thursday":{"open":"09:00","close":"17:00","is_closed":false},"friday":{"open":"09:00","close":"17:00","is_closed":false},"saturday":{"open":"09:00","close":"17:00","is_closed":false},"sunday":{"open":"09:00","close":"17:00","is_closed":false}}'::jsonb),
    '{}'::text[]
)
RETURNING *;
`;

// CATEGORIES
const createCategoryQuery: string = `
INSERT INTO categories (id, name, description, image_url, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
`;

// PRODUCTS
const createProductQuery: string = `
INSERT INTO products (id, name, description, price, image_url, sort_order, ingredients)
VALUES ($1, $2, $3, $4, $5, $6, $7::text[]);
`;

const linkProductCategoryQuery: string = `
INSERT INTO product_categories (product_id, category_id)
VALUES ($1, $2);
`;

// MODIFIER GROUPS
const createModifierGroupQuery: string = `
INSERT INTO modifier_groups (id, name, required, min_selections, max_selections, sort_order)
VALUES ($1, $2, $3, $4, $5, $6);
`;

// MODIFIERS
const createModifierQuery: string = `
INSERT INTO modifiers (id, modifier_group_id, name, price, sort_order)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;
`;

// OFFERS
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

// ORDERS
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
    notes,
    payment_reference
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
RETURNING *;
`;

const registerKdsNotificationQuery: string = `
INSERT INTO kds_notifications (branch_id, device_id, expo_push_token, platform)
VALUES ($1, $2, $3, $4)
ON CONFLICT (branch_id, device_id)
DO UPDATE SET
    expo_push_token = EXCLUDED.expo_push_token,
    platform = EXCLUDED.platform,
    active = TRUE,
    updated_at = NOW();
`;

const createOrderItemQuery: string = `
INSERT INTO order_items (id, order_id, product_id, offer_id, offer_rule_id, name, quantity, unit_price, total, notes, removed_ingredients)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[]);
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
INSERT INTO payments (id, order_id, provider, provider_payment_id, amount, currency, status)
VALUES ($1, $2, $3, $4, $5, $6, 'PENDING');
`;

export const POST = {
    BUSINESS: createBusinessQuery,
    USER: createUserQuery,
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
    ORDER: createOrderQuery,
    KDS_NOTIFICATION: registerKdsNotificationQuery,
    ORDER_ITEM: createOrderItemQuery,
    ORDER_OFFER: createOrderOfferQuery,
    ORDER_ITEM_MODIFIER: createOrderItemModifierQuery,
    PAYMENT: createPaymentQuery,
};