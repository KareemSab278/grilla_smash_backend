/*
    BRANCH PRODUCT OVERRIDES - PER BRANCH PRICE / AVAILABILITY.

    GET    /branches/:branchId/products             active products with effective_price (override or base price)
    PUT    /branches/:branchId/products/:productId  set { active, price_override }, null = use the normal value
    DELETE /branches/:branchId/products/:productId  remove the override
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbAll, dbGet, dbRun, transaction } from "../database/db";
import { getRequiredRow, orNull, requireRow } from "../helpers/helpers";
import { parseInput } from "../middleware/validate";
import { requireBranchManager } from "../middleware/requireBranchManager";
import { branchProductOverrideSchema, productListQuerySchema } from "../database/schemas";
import type { BranchProductOverrideRow, BranchProductResponse, BranchRow, ProductRow, SuccessResponse } from "../types";

const router = express.Router();

router.get("/branches/:branchId/products", async (req, res) => await getBranchProducts(req, res));
router.put("/branches/:branchId/products/:productId", async (req, res) => await setBranchProductOverride(req, res));
router.delete(
    "/branches/:branchId/products/:productId",
    async (req, res) => await deleteBranchProductOverride(req, res)
);

// ========================================

type BranchParams = { branchId: string };
type BranchProductParams = BranchParams & { productId: string };

type BranchProductJoinRow = ProductRow & {
    branch_active: boolean | null;
    price_override: number | null;
};

// ========================================

// active products for the branch with the branch's own price applied. NULL override = use the normal value
const getBranchProducts = async (req: Request<BranchParams>, res: Response<BranchProductResponse[]>): Promise<void> => {
    const { branchId } = req.params;
    const { include_hidden: includeHidden } = parseInput(productListQuerySchema, req.query);

    await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");

    const rows = await dbAll<BranchProductJoinRow>(sql, QUERIES.GET.BRANCH_PRODUCTS, [branchId, includeHidden]);

    res.json(rows.map(row => ({ ...row, effective_price: row.price_override ?? row.price })));
};

// ========================================

const setBranchProductOverride = async (
    req: Request<BranchProductParams>,
    res: Response<BranchProductOverrideRow>
): Promise<void> => {
    await requireBranchManager(req);
    const { branchId, productId } = req.params;
    const data = parseInput(branchProductOverrideSchema, req.body);

    const override = await transaction(async tx => {
        await getRequiredRow<BranchRow>(tx, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");
        await getRequiredRow<ProductRow>(tx, QUERIES.GET.PRODUCT_BY_ID, productId, "product");

        return await dbGet<BranchProductOverrideRow>(tx, QUERIES.PUT.BRANCH_PRODUCT_OVERRIDE, [
            branchId,
            productId,
            orNull(data.active),
            orNull(data.price_override),
        ]);
    });

    res.json(requireRow(override, "branch product override"));
};

// ========================================

const deleteBranchProductOverride = async (
    req: Request<BranchProductParams>,
    res: Response<SuccessResponse>
): Promise<void> => {
    await requireBranchManager(req);
    const { branchId, productId } = req.params;

    await dbRun(sql, QUERIES.DELETE.BRANCH_PRODUCT_OVERRIDE, [branchId, productId]);

    res.json({ success: true });
};

// ========================================

export default router;
