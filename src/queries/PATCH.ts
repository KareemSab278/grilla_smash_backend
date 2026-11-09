// BRANCHES
const updateBranchOpeningHoursQuery: string = `
UPDATE branches
SET opening_hours = $2
WHERE id = $1
RETURNING *;
`;

// ORDERS
const updateOrderStatusQuery: string = `
UPDATE orders
SET status = $2
WHERE id = $1
RETURNING id, status;
`;

const refundOrderQuery: string = `
UPDATE orders
SET status = $2, refund_reason = $3
WHERE id = $1
RETURNING id, status, refund_reason;
`;

const deactivateKdsNotificationQuery: string = `
UPDATE kds_notifications
SET active = FALSE, updated_at = NOW()
WHERE id = $1 AND active = TRUE;
`;

const purgeOldCustomerDataQuery: string = `
WITH candidate_orders AS (
    SELECT id
    FROM orders
    WHERE branch_id = ANY($1::text[])
      AND created_at < NOW() - INTERVAL '72 hours'
      AND status <> 'CANCELLED'
      AND (
          customer_name IS DISTINCT FROM '-' OR
          customer_phone IS NOT NULL OR
          customer_email IS NOT NULL OR
          address_line1 IS NOT NULL OR
          address_line2 IS NOT NULL OR
          city IS NOT NULL OR
          postcode IS NOT NULL OR
          notes IS NOT NULL
      )
    ORDER BY created_at
    LIMIT 1000
),
updated_orders AS (
    UPDATE orders
    SET
        customer_name = '-',
        customer_phone = NULL,
        customer_email = NULL,
        address_line1 = NULL,
        address_line2 = NULL,
        city = NULL,
        postcode = NULL,
        notes = NULL,
        updated_at = NOW()
    FROM candidate_orders
    WHERE orders.id = candidate_orders.id
    RETURNING orders.id
)
SELECT count(*)::int AS updated_count
FROM updated_orders;
`;

export const PATCH = {
    ORDER_REFUND: refundOrderQuery,
    BRANCH_OPENING_HOURS: updateBranchOpeningHoursQuery,
    ORDER_STATUS: updateOrderStatusQuery,
    KDS_NOTIFICATION_DEACTIVATE: deactivateKdsNotificationQuery,
    PURGE_OLD_CUSTOMER_DATA: purgeOldCustomerDataQuery,
};