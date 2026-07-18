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
    p.popular
FROM products p
JOIN categories c
    ON c.id = p.category_id
WHERE p.active = true
ORDER BY p.id;`;
const getOptions = `
SELECT
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
const getOrdersQuery = `
SELECT
    o.id,
    o.customer_name,
    o.customer_phone,
    o.order_status,
    o.total::float,
    o.created_at,

    json_agg(
        json_build_object(
            'product_id', oi.product_id,
            'product_name', p.name,
            'quantity', oi.quantity,
            'price', oi.price::float,
            'options', (
                SELECT json_agg(
                    json_build_object(
                        'option_id', oio.option_id,
                        'name', op.name,
                        'price', oio.price::float
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

GROUP BY o.id

ORDER BY o.created_at DESC;
`;
const createOrderQuery = `
WITH new_order AS (
    INSERT INTO orders (
        branch_id,
        customer_name,
        customer_phone,
        total
    )
    VALUES (
        $1,
        $2,
        $3,
        $4
    )
    RETURNING id
)

INSERT INTO order_items (
    order_id,
    product_id,
    quantity,
    price
)
SELECT
    new_order.id,
    item.product_id,
    item.quantity,
    item.price
FROM new_order,
json_to_recordset($5)
AS item(
    product_id integer,
    quantity integer,
    price numeric
)

RETURNING order_id;
`;
const updateOrderStatusQuery = `
UPDATE orders
SET order_status = $2
WHERE id = $1
RETURNING
    id,
    order_status;
`;
exports.QUERIES = {
    'GET': {
        'PRODUCTS': getProductsQuery,
        'EXTRAS': getOptions,
        'MEALS': getMeals,
        'ORDERS': getOrdersQuery,
    },
    'POST': {
        'ORDER': createOrderQuery,
    },
    'PATCH': {
        'ORDER_STATUS': updateOrderStatusQuery,
    }
};
