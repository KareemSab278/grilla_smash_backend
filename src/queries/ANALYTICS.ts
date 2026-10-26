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
WITH days AS (
    SELECT to_char(o.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day,
           count(*)::float8 AS order_count, sum(o.subtotal)::float8 AS subtotal,
           sum(o.discount)::float8 AS discount, sum(o.delivery_fee)::float8 AS delivery_fee,
           sum(o.total)::float8 AS total,
           floor(sum(o.total)::numeric / count(*) + 0.5)::float8 AS average_order_value
    FROM orders o
    WHERE ${branch} AND ${bounds} AND ${completed}
    GROUP BY 1
)
SELECT json_build_object(
           'order_count', coalesce(sum(order_count), 0)::float8,
           'subtotal', coalesce(sum(subtotal), 0)::float8,
           'discount', coalesce(sum(discount), 0)::float8,
           'delivery_fee', coalesce(sum(delivery_fee), 0)::float8,
           'total', coalesce(sum(total), 0)::float8,
           'average_order_value', coalesce(floor(sum(total)::numeric / nullif(sum(order_count), 0) + 0.5), 0)::float8
       ) AS summary,
       coalesce(json_agg(days ORDER BY day), '[]'::json) AS days
FROM days;
`;

const ORDERS = `
WITH grouped AS MATERIALIZED (
    SELECT CASE WHEN o.status LIKE '% - refund %'
                THEN split_part(o.status, ' - refund ', 1) || ' (PARTIAL REFUND)'
                ELSE o.status END AS status,
           o.order_type, count(*)::float8 AS order_count
    FROM orders o
    WHERE ${branch} AND ${bounds}
    GROUP BY 1, 2
),
statuses AS (
    SELECT status, sum(order_count)::float8 AS order_count
    FROM grouped GROUP BY status
),
types AS (
    SELECT order_type, sum(order_count)::float8 AS order_count
    FROM grouped
    WHERE status IN ('COMPLETED', 'COMPLETED (PARTIAL REFUND)')
    GROUP BY order_type
),
type_rows AS (
    SELECT choices.order_type, coalesce(types.order_count, 0)::float8 AS order_count, choices.sort_order
    FROM (VALUES ('PICKUP', 1), ('DELIVERY', 2)) AS choices(order_type, sort_order)
    LEFT JOIN types ON types.order_type = choices.order_type
)
SELECT coalesce((SELECT json_agg(statuses ORDER BY status) FROM statuses), '[]'::json) AS by_status,
       (SELECT json_agg(json_build_object('order_type', order_type, 'order_count', order_count)
                        ORDER BY sort_order) FROM type_rows) AS by_type;
`;

const REFUNDS = `
SELECT count(*)::float8 AS refund_count
FROM orders o
WHERE ${branch} AND ${bounds} AND o.status = 'REFUNDED';
`;

const PEAKS = `
WITH buckets AS MATERIALIZED (
    SELECT to_char(o.created_at AT TIME ZONE 'Europe/London', 'YYYY-MM') AS month,
           extract(isodow FROM o.created_at AT TIME ZONE 'Europe/London')::int AS weekday,
           extract(hour FROM o.created_at AT TIME ZONE 'Europe/London')::int AS hour,
           count(*)::float8 AS order_count
    FROM orders o
    WHERE ${branch} AND ${bounds} AND ${completed}
    GROUP BY 1, 2, 3
),
time_totals AS (
    SELECT weekday, hour, sum(order_count)::float8 AS order_count
    FROM buckets GROUP BY weekday, hour
),
heatmap AS MATERIALIZED (
    SELECT w.weekday, h.hour, coalesce(t.order_count, 0)::float8 AS order_count
    FROM generate_series(1, 7) AS w(weekday)
    CROSS JOIN generate_series(0, 23) AS h(hour)
    LEFT JOIN time_totals t ON t.weekday = w.weekday AND t.hour = h.hour
),
weekday_totals AS (
    SELECT weekday, sum(order_count)::float8 AS order_count FROM heatmap GROUP BY weekday
),
hour_totals AS (
    SELECT hour, sum(order_count)::float8 AS order_count FROM heatmap GROUP BY hour
),
month_hours AS (
    SELECT months.month, h.hour, coalesce(sum(b.order_count), 0)::float8 AS order_count
    FROM (SELECT DISTINCT month FROM buckets) months
    CROSS JOIN generate_series(0, 23) AS h(hour)
    LEFT JOIN buckets b ON b.month = months.month AND b.hour = h.hour
    GROUP BY months.month, h.hour
),
month_totals AS (
    SELECT month, sum(order_count)::float8 AS order_count,
           json_agg(json_build_object('hour', hour, 'order_count', order_count) ORDER BY hour) AS by_hour
    FROM month_hours GROUP BY month
)
SELECT (SELECT json_agg(weekday_totals ORDER BY weekday) FROM weekday_totals) AS by_weekday,
       (SELECT json_agg(hour_totals ORDER BY hour) FROM hour_totals) AS by_hour,
       (SELECT json_agg(heatmap ORDER BY weekday, hour) FROM heatmap) AS heatmap,
       coalesce((SELECT json_agg(month_totals ORDER BY month) FROM month_totals), '[]'::json) AS by_month;
`;

const PRODUCTS = `
WITH product_totals AS MATERIALIZED (
    SELECT i.product_id, sum(i.quantity) AS quantity, sum(i.total) AS item_value
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
    WHERE ${branch} AND ${bounds} AND ${completed}
    GROUP BY i.product_id
),
product_rows AS (
    SELECT p.id, p.name, p.active, coalesce(t.quantity, 0)::float8 AS quantity,
           coalesce(t.item_value, 0)::float8 AS item_value
    FROM products p LEFT JOIN product_totals t ON t.product_id = p.id
),
category_rows AS (
    SELECT c.id, c.name, c.active, coalesce(sum(t.quantity), 0)::float8 AS quantity,
           coalesce(sum(t.item_value), 0)::float8 AS item_value
    FROM categories c
    LEFT JOIN product_categories pc ON pc.category_id = c.id
    LEFT JOIN product_totals t ON t.product_id = pc.product_id
    GROUP BY c.id, c.name, c.active
)
SELECT coalesce((SELECT json_agg(product_rows ORDER BY name, id) FROM product_rows), '[]'::json) AS products,
       coalesce((SELECT json_agg(category_rows ORDER BY name, id) FROM category_rows), '[]'::json) AS categories;
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
    BRANCH_EXISTS, SALES, ORDERS, REFUNDS, PEAKS, PRODUCTS, OFFERS, MODIFIERS, DELIVERY, BRANCHES,
};
