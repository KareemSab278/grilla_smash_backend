const getProductsQuery: string = `
SELECT
    p.id,
    p.name,
    c.name AS category,
    p.price::float,
    p.description,
    p.image,
    p.popular
FROM products p
JOIN categories c
    ON c.id = p.category_id
WHERE p.active = true
ORDER BY p.id;`


const getOptions: string = `
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
    ON o.id = co.option_id;`


const getMeals: string = `
SELECT
    name,
    price_modifier::float AS price
FROM meal_options;`


const createOrderQuery: string = `
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
    payment_id
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
    $13
)
RETURNING id;
`;


const updateOrderStatusQuery: string = `
UPDATE orders
SET order_status = $2
WHERE id = $1
RETURNING
    id,
    order_status;
`;

const getStoreInfoQuery: string = `
SELECT id, name, location, latitude, longitude, created_at
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

const getOrdersByBranchIdQuery: string = `
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

WHERE o.branch_id = $1
AND o.order_status != 'delivered' and o.order_status != 'refunded' and o.order_status != 'completed'
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


export const QUERIES = {
    GET: {
        PRODUCTS: getProductsQuery,
        EXTRAS: getOptions,
        MEALS: getMeals,
        MEAL_SIDES: getMealSidesQuery,
        MEAL_DRINKS: getMealDrinksQuery,
        BRANCH_INFO: getStoreInfoQuery,
        "ALL-BRANCHES": `SELECT * FROM branches; `,
        ORDERS_BY_BRANCH_ID: getOrdersByBranchIdQuery,
        BRANCH_KEY: getBranchKeyByBranchIdQuery,
        BRANCH_KEY_BY_ORDER: getBranchKeyByOrderIdQuery,
    },

    POST: {
        ORDER: createOrderQuery,
    },

    PATCH: {
        ORDER_STATUS: updateOrderStatusQuery,
    }
};