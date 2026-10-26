// Date bounds are local calendar days converted to instants before filtering,
// allowing the branch/created_at indexes to be used.
const bounds = `
    o.created_at >= ($2::date::timestamp AT TIME ZONE 'Europe/London')
    AND o.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Europe/London')
`;
const branch = `($1::text IS NULL OR o.branch_id = $1)`;
const completed = `(o.status = 'COMPLETED' OR o.status LIKE 'COMPLETED - refund %')`;

const BRANCH_EXISTS = `SELECT id FROM branches WHERE id = $1;`;

const SALES = `
SELECT to_char(o.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day,
       count(*)::float8 AS order_count, sum(o.subtotal)::float8 AS subtotal,
       sum(o.discount)::float8 AS discount, sum(o.delivery_fee)::float8 AS delivery_fee,
       sum(o.total)::float8 AS total
FROM orders o
WHERE ${branch} AND ${bounds} AND ${completed}
GROUP BY 1 ORDER BY 1;
`;

const ORDERS = `
SELECT CASE WHEN o.status LIKE '% - refund %'
            THEN split_part(o.status, ' - refund ', 1) || ' (PARTIAL REFUND)'
            ELSE o.status END AS status,
       o.order_type, count(*)::float8 AS order_count
FROM orders o
WHERE ${branch} AND ${bounds}
GROUP BY 1, 2 ORDER BY 1, 2;
`;

const REFUNDS = `
SELECT to_char(o.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day,
       count(*)::float8 AS refund_count, sum(o.total)::float8 AS total
FROM orders o
WHERE ${branch} AND ${bounds} AND o.status = 'REFUNDED'
GROUP BY 1 ORDER BY 1;
`;

const PEAKS = `
SELECT to_char(o.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM') AS month,
       extract(isodow FROM o.created_at AT TIME ZONE 'Europe/London')::int AS weekday,
       extract(hour FROM o.created_at AT TIME ZONE 'Europe/London')::int AS hour,
       count(*)::float8 AS order_count
FROM orders o
WHERE ${branch} AND ${bounds} AND ${completed}
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
`;

const PRODUCTS = `
SELECT p.id, p.name, p.active, COALESCE(s.quantity, 0)::float8 AS quantity,
       COALESCE(s.item_value, 0)::float8 AS item_value
FROM products p
LEFT JOIN (
    SELECT i.product_id, sum(i.quantity) AS quantity, sum(i.total) AS item_value
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
    WHERE ${branch} AND ${bounds} AND ${completed}
    GROUP BY i.product_id
) s ON s.product_id = p.id
ORDER BY p.name, p.id;
`;

const CATEGORY_PRODUCTS = `
SELECT c.id, c.name, c.active, pc.product_id
FROM categories c
LEFT JOIN product_categories pc ON pc.category_id = c.id
ORDER BY c.name, c.id;
`;

const OFFERS = `
SELECT oo.offer_id, oo.name, count(*)::float8 AS offer_lines,
       sum(oo.discount)::float8 AS discount
FROM orders o
JOIN order_offers oo ON oo.order_id = o.id
WHERE ${branch} AND ${bounds} AND ${completed}
GROUP BY oo.offer_id, oo.name ORDER BY offer_lines DESC, oo.name;
`;

const MODIFIERS = `
SELECT m.modifier_id, m.name,
       sum(m.quantity::bigint * i.quantity)::float8 AS quantity,
       sum(m.price::bigint * m.quantity * i.quantity)::float8 AS item_value
FROM orders o
JOIN order_items i ON i.order_id = o.id
JOIN order_item_modifiers m ON m.order_item_id = i.id
WHERE ${branch} AND ${bounds} AND ${completed}
GROUP BY m.modifier_id, m.name ORDER BY quantity DESC, m.name;
`;

const DELIVERY = `
SELECT CASE WHEN upper(regexp_replace(trim(o.postcode), '[[:space:]]', '', 'g'))
                         ~ '^([A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}|GIR0AA)$'
            THEN left(upper(regexp_replace(trim(o.postcode), '[[:space:]]', '', 'g')),
                      length(regexp_replace(trim(o.postcode), '[[:space:]]', '', 'g')) - 3)
            ELSE 'Unknown' END AS postcode_area,
       count(*)::float8 AS order_count, sum(o.total)::float8 AS total,
       sum(o.delivery_fee)::float8 AS delivery_fee
FROM orders o
WHERE ${branch} AND ${bounds} AND ${completed} AND o.order_type = 'DELIVERY'
GROUP BY 1 ORDER BY order_count DESC, postcode_area;
`;

const BRANCHES = `
SELECT b.id, b.name, b.active, COALESCE(s.order_count, 0)::float8 AS order_count,
       COALESCE(s.total, 0)::float8 AS total
FROM branches b
LEFT JOIN (
    SELECT o.branch_id, count(*) AS order_count, sum(o.total) AS total
    FROM orders o
    WHERE $1::text IS NULL AND ${bounds} AND ${completed}
    GROUP BY o.branch_id
) s ON s.branch_id = b.id
ORDER BY b.name, b.id;
`;

export const ANALYTICS = {
    BRANCH_EXISTS, SALES, ORDERS, REFUNDS, PEAKS, PRODUCTS, CATEGORY_PRODUCTS, OFFERS, MODIFIERS, DELIVERY, BRANCHES,
};
