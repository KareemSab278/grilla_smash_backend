"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUERIES = void 0;
const getProductsQuery = `
SELECT
    p.id,
    p.name,
    c.name AS category,
    p.price::float,
    p.description,
    p.image,
    p.popular,
    p.ingredients,
    p.in_deal
FROM products p
JOIN categories c
    ON c.id = p.category_id
WHERE p.active = true
ORDER BY p.id;`;
const getOptions = `
SELECT
    o.id,
    c.name AS category,
    o.name,
    o.price::float,
    o.is_protein
FROM category_options co
JOIN categories c
    ON c.id = co.category_id
JOIN options o
    ON o.id = co.option_id;`;
const getMeals = `
SELECT
    name,
    price_modifier::float AS price
FROM meal_options;`;
const createOrderQuery = `
INSERT INTO orders (
    branch_id,
    customer_name,
    customer_phone,
    customer_email,
    customer_address1,
    customer_address2,
    customer_city,
    customer_postcode,
    is_pickup,
    delivery_fee,
    total,
    order_status,
    payment_id,
    order_notes
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
    $10,
    $11,
    $12,
    $13,
    $14
)
RETURNING id;
`;
const updateOrderStatusQuery = `
UPDATE orders
SET order_status = $2
WHERE id = $1
RETURNING
    id,
    order_status;
`;
const updateBranchStatusQuery = `
UPDATE branches
SET active = $2
WHERE id = $1
RETURNING
    id,
    active;
`;
const purgeOldCustomerDataQuery = `
WITH candidate_orders AS (
    SELECT id
    FROM orders
    WHERE created_at < NOW() - INTERVAL '72 hours'
      AND created_at >= NOW() - INTERVAL '96 hours'
      AND order_status NOT IN ('cancelled')
      AND (
          customer_name IS NOT NULL OR
          customer_phone IS NOT NULL OR
          customer_email IS NOT NULL OR
          customer_address1 IS NOT NULL OR
          customer_address2 IS NOT NULL OR
          customer_city IS NOT NULL OR
          customer_postcode IS NOT NULL OR
          order_notes IS NOT NULL
      )
    LIMIT 1000
),
updated_orders AS (
    UPDATE orders
    SET
        customer_name = '-',
        customer_phone = 0,
        customer_email = '-',
        customer_address1 = '-',
        customer_address2 = '-',
        customer_city = '-',
        customer_postcode = '-',
        order_notes = '-'
    FROM candidate_orders
    WHERE orders.id = candidate_orders.id
    RETURNING orders.id
)
SELECT count(*) AS updated_count
FROM updated_orders;
`;
const getStoreInfoQuery = `
SELECT id, name, location, latitude, longitude, created_at, active
FROM branches
WHERE LOWER(name) = LOWER($1);
`;
const getBranchKeyByBranchIdQuery = `
    SELECT branch_key FROM branches WHERE id = $1;
`;
const getBranchKeyByOrderIdQuery = `
    SELECT b.branch_key
    FROM orders o
    JOIN branches b ON b.id::text = o.branch_id::text
    WHERE o.id = $1;
`;
// gets in the last day
const getOrdersByBranchIdQuery = `
SELECT
o.id,
       o.customer_name,
    o.customer_phone,
    o.order_status,
    o.payment_id,
    o.customer_city,
    o.customer_postcode,
    o.customer_address1,
    o.customer_address2,
    o.order_notes,
    o.total:: float,
        o.created_at,
        o.is_pickup,
        json_agg(
            json_build_object(
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'price', oi.price:: float,
                'sauce_choice', oi.sauce_choice,
                'notes', oi.notes,
                'meal', (
                SELECT json_build_object(
                    'drink_id', oim.drink_id,
                    'drink_name', mdo.name,
                    'side_id', oim.side_id,
                    'side_name', mso.name
                )
                FROM order_item_meals oim
                LEFT JOIN meal_drink_options mdo ON mdo.id = oim.drink_id
                LEFT JOIN meal_side_options mso ON mso.id = oim.side_id
                WHERE oim.order_item_id = oi.id
            ),
                'options', (
                SELECT json_agg(
                    json_build_object(
                        'option_id', oio.option_id,
                        'name', op.name,
                        'price', oio.price:: float
                    )
                )
                FROM order_item_options oio
                JOIN options op
                    ON op.id = oio.option_id
                WHERE oio.order_item_id = oi.id
            )
        )
    ) AS items

FROM orders o

LEFT JOIN order_items oi
    ON oi.order_id = o.id

LEFT JOIN products p
    ON p.id = oi.product_id

WHERE o.branch_id = $1 and o.created_at >= NOW() - INTERVAL '1 day' -- today's orders only
AND o.order_status != 'delivered' and o.order_status != 'refunded' and o.order_status != 'completed'
GROUP BY o.id

ORDER BY o.created_at DESC;
`;
// gets in the last 30 days
const getHistoryOrdersByBranchIdQuery = `
SELECT
o.id,
       o.customer_name,
    o.customer_phone,
    o.order_status,
    o.payment_id,
    o.customer_city,
    o.customer_postcode,
    o.customer_address1,
    o.customer_address2,
    o.order_notes,
    o.total:: float,
        o.created_at,
        o.is_pickup,
        json_agg(
            json_build_object(
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'price', oi.price:: float,
                'sauce_choice', oi.sauce_choice,
                'notes', oi.notes,
                'meal', (
                SELECT json_build_object(
                    'drink_id', oim.drink_id,
                    'drink_name', mdo.name,
                    'side_id', oim.side_id,
                    'side_name', mso.name
                )
                FROM order_item_meals oim
                LEFT JOIN meal_drink_options mdo ON mdo.id = oim.drink_id
                LEFT JOIN meal_side_options mso ON mso.id = oim.side_id
                WHERE oim.order_item_id = oi.id
            ),
                'options', (
                SELECT json_agg(
                    json_build_object(
                        'option_id', oio.option_id,
                        'name', op.name,
                        'price', oio.price:: float
                    )
                )
                FROM order_item_options oio
                JOIN options op
                    ON op.id = oio.option_id
                WHERE oio.order_item_id = oi.id
            )
        )
    ) AS items

FROM orders o

JOIN order_items oi
    ON oi.order_id = o.id

JOIN products p
    ON p.id = oi.product_id

WHERE o.branch_id = $1 and o.created_at >= NOW() - INTERVAL '30 day'
GROUP BY o.id

ORDER BY o.created_at DESC;
`;
const getMealSidesQuery = `
SELECT
id,
    name,
    price:: float
FROM meal_side_options
ORDER BY id;
`;
const getMealDrinksQuery = `
SELECT
id,
    name,
    price:: float
FROM meal_drink_options
ORDER BY id;
`;
const getCustEmailByOrderIdQuery = `SELECT customer_email FROM orders WHERE id = $1;`;
exports.QUERIES = {
    GET: {
        PRODUCTS: getProductsQuery,
        EXTRAS: getOptions,
        MEALS: getMeals,
        MEAL_SIDES: getMealSidesQuery,
        MEAL_DRINKS: getMealDrinksQuery,
        BRANCH_INFO: getStoreInfoQuery,
        CUSTOMER_EMAIL_BY_ORDER_ID: getCustEmailByOrderIdQuery,
        "ALL-BRANCHES": `SELECT id, name, location, latitude, longitude, active FROM branches; `,
        ORDERS_BY_BRANCH_ID: getOrdersByBranchIdQuery,
        BRANCH_KEY: getBranchKeyByBranchIdQuery,
        BRANCH_KEY_BY_ORDER: getBranchKeyByOrderIdQuery,
        HISTORY_BY_BRANCH_ID: getHistoryOrdersByBranchIdQuery,
    },
    POST: {
        ORDER: createOrderQuery,
    },
    PATCH: {
        ORDER_STATUS: updateOrderStatusQuery,
        BRANCH_STATUS: updateBranchStatusQuery,
        PURGE_OLD_CUSTOMER_DATA: purgeOldCustomerDataQuery,
    }
};
