// BUSINESS
const BUSINESS_COLUMNS = "id, name, slug, logo_url, currency, active, created_at, updated_at";

const updateBusinessQuery: string = `
UPDATE business
SET
    name = COALESCE($1, name),
    slug = COALESCE($2, slug),
    logo_url = COALESCE($3, logo_url),
    currency = COALESCE($4, currency),
    active = COALESCE($5, active)
WHERE id = $6
RETURNING ${BUSINESS_COLUMNS};
`;

// USERS
const updateUserPasswordQuery: string = `
UPDATE users
SET password_hash = $2, updated_at = now()
WHERE id = $1 AND active
RETURNING id;
`;

// BRANCHES
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
    active = COALESCE($9, active),
    delivery_disabled = COALESCE($10, delivery_disabled),
    pickup_disabled = COALESCE($11, pickup_disabled),
    delivery_range_km = COALESCE($12, delivery_range_km)
WHERE id = $13
RETURNING *;
`;

const updateBranchOpeningHoursQuery: string = `
UPDATE branches
SET opening_hours = $2
WHERE id = $1
RETURNING *;
`;

const updateBranchUnavailableProductsQuery: string = `
UPDATE branches
SET unavailable_products = $2::text[]
WHERE id = $1
RETURNING *;
`;

const addBranchUnavailableProductQuery: string = `
UPDATE branches
SET unavailable_products = CASE
    WHEN $2 = ANY(unavailable_products) THEN unavailable_products
    ELSE array_append(unavailable_products, $2)
END
WHERE id = $1
RETURNING *;
`;

// CATEGORIES
const setCategoryImageQuery: string = `UPDATE categories SET image_url = $1 WHERE id = $2 RETURNING image_url;`;
const clearCategoryImageReferencesQuery: string = `UPDATE categories SET image_url = NULL WHERE image_url = $1 RETURNING id;`;

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

// PRODUCTS
const setProductImageQuery: string = `UPDATE products SET image_url = $1 WHERE id = $2 RETURNING image_url;`;
const clearProductImageReferencesQuery: string = `UPDATE products SET image_url = NULL WHERE image_url = $1 RETURNING id;`;

const updateProductQuery: string = `
UPDATE products
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    price = COALESCE($3, price),
    image_url = COALESCE($4, image_url),
    sort_order = COALESCE($5, sort_order),
    active = COALESCE($6, active),
    ingredients = COALESCE($7::text[], ingredients)
WHERE id = $8
RETURNING id;
`;

// MODIFIER GROUPS
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

// MODIFIERS
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

// PRODUCT <-> MODIFIER GROUP
const attachModifierGroupQuery: string = `
INSERT INTO product_modifier_groups (product_id, modifier_group_id, sort_order)
VALUES ($1, $2, $3)
ON CONFLICT (product_id, modifier_group_id)
DO UPDATE SET sort_order = EXCLUDED.sort_order;
`;

// BRANCH PRODUCT OVERRIDES
const setBranchProductOverrideQuery: string = `
INSERT INTO branch_product_overrides (branch_id, product_id, active, price_override)
VALUES ($1, $2, $3, $4)
ON CONFLICT (branch_id, product_id)
DO UPDATE SET active = EXCLUDED.active, price_override = EXCLUDED.price_override
RETURNING *;
`;

// OFFERS
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

export const PUT = {
    BUSINESS: updateBusinessQuery,
    USER_PASSWORD: updateUserPasswordQuery,
    BRANCH: updateBranchQuery,
    BRANCH_OPENING_HOURS: updateBranchOpeningHoursQuery,
    BRANCH_UNAVAILABLE_PRODUCTS: updateBranchUnavailableProductsQuery,
    BRANCH_UNAVAILABLE_PRODUCT: addBranchUnavailableProductQuery,
    CATEGORY: updateCategoryQuery,
    CATEGORY_IMAGE: setCategoryImageQuery,
    CLEAR_CATEGORY_IMAGE_REFERENCES: clearCategoryImageReferencesQuery,
    PRODUCT: updateProductQuery,
    PRODUCT_IMAGE: setProductImageQuery,
    CLEAR_PRODUCT_IMAGE_REFERENCES: clearProductImageReferencesQuery,
    MODIFIER_GROUP: updateModifierGroupQuery,
    MODIFIER: updateModifierQuery,
    OFFER: updateOfferQuery,
    PRODUCT_MODIFIER_GROUP: attachModifierGroupQuery,
    BRANCH_PRODUCT_OVERRIDE: setBranchProductOverrideQuery,
};