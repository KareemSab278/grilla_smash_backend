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

export const PATCH = {
    BRANCH_OPENING_HOURS: updateBranchOpeningHoursQuery,
    ORDER_STATUS: updateOrderStatusQuery,
};