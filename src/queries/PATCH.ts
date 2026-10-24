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

export const PATCH = {
    ORDER_REFUND: refundOrderQuery,
    BRANCH_OPENING_HOURS: updateBranchOpeningHoursQuery,
    ORDER_STATUS: updateOrderStatusQuery,
};