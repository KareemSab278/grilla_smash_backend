/*
    BRANCH ROUTES

    GET    /branches            all branches, by name
    GET    /branches/:branchId
    GET    /branch-locations     all branch locations
    POST   /branches
    PUT    /branches/:branchId  partial update
    PATCH  /branches/:branchId/opening-hours
    PUT    /branches/:branchId/unavailable-products
    PUT    /branches/:branchId/unavailable-products/:productId
    DELETE /branches/:branchId/unavailable-products/:productId
    DELETE /branches/:branchId  409 while the branch still has orders
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbGet } from "../db";
import { deleteById, getRequiredRow, newId, orNull, requireRow, unique } from "../helpers";
import { parseInput } from "../middleware/validate";
import { requireBranchManager } from "../middleware/requireBranchManager";
import {
    branchCreateSchema,
    branchUnavailableProductsSchema,
    branchUpdateSchema,
    openingHoursPatchSchema,
    openingHoursSchema,
} from "../schemas";
import { mergeOpeningHours } from "../branchHours";
import type { BranchRow, DeleteResponse } from "../types";
import type { ProductRow } from "../types";
import { notFound } from "../errors";

const router = express.Router();

router.get("/branches", async (req, res) => await listBranches(req, res));
router.get("/branches/:branchId", async (req, res) => await getBranch(req, res));
router.post("/branches", async (req, res) => await createBranch(req, res));
router.get("/branch-locations", async (req, res) => await listBranchLocations(req, res));
router.put("/branches/:branchId", async (req, res) => await updateBranch(req, res));
router.patch("/branches/:branchId/opening-hours", async (req, res) => await updateOpeningHours(req, res));
router.put("/branches/:branchId/unavailable-products", async (req, res) => await updateUnavailableProducts(req, res));
router.put(
    "/branches/:branchId/unavailable-products/:productId",
    async (req, res) => await markProductUnavailable(req, res)
);
router.delete(
    "/branches/:branchId/unavailable-products/:productId",
    async (req, res) => await restoreProductAvailability(req, res)
);
router.delete("/branches/:branchId", async (req, res) => await deleteBranch(req, res));

// ========================================

type BranchParams = { branchId: string };
type BranchProductParams = BranchParams & { productId: string };

// ========================================

const listBranches = async (_req: Request, res: Response<BranchRow[]>): Promise<void> => {
    res.json(await dbAll<BranchRow>(sql, QUERIES.GET.BRANCHES));
};

// ========================================

const getBranch = async (req: Request<BranchParams>, res: Response<BranchRow>): Promise<void> => {
    res.json(await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, req.params.branchId, "branch"));
};

// ========================================

const createBranch = async (req: Request, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const data = parseInput(branchCreateSchema, req.body);

    const created = await dbGet<BranchRow>(sql, QUERIES.POST.BRANCH, [
        newId(),
        data.name,
        data.address_line1,
        orNull(data.address_line2),
        data.city,
        data.postcode,
        orNull(data.phone),
        orNull(data.latitude),
        orNull(data.longitude),
        orNull(data.opening_hours ? JSON.stringify(data.opening_hours) : undefined),
    ]);

    res.json(requireRow(created, "branch"));
};

// ========================================

const updateBranch = async (req: Request<BranchParams>, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const data = parseInput(branchUpdateSchema, req.body);

    const updated = await dbGet<BranchRow>(sql, QUERIES.PUT.BRANCH, [
        orNull(data.name),
        orNull(data.address_line1),
        orNull(data.address_line2),
        orNull(data.city),
        orNull(data.postcode),
        orNull(data.phone),
        orNull(data.latitude),
        orNull(data.longitude),
        orNull(data.active),
        req.params.branchId,
    ]);

    res.json(requireRow(updated, "branch"));
};

const listBranchLocations = async (_req: Request, res: Response<BranchRow[]>): Promise<void> => {
    res.json(await dbAll<BranchRow>(sql, QUERIES.GET.BRANCH_LOCATIONS));
};

// ========================================

const updateOpeningHours = async (req: Request<BranchParams>, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const data = parseInput(openingHoursPatchSchema, req.body);
    const branch = await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, req.params.branchId, "branch");

    const merged = mergeOpeningHours(branch.opening_hours, data);
    const validated = openingHoursSchema.parse(merged);

    const updated = await dbGet<BranchRow>(sql, QUERIES.PATCH.BRANCH_OPENING_HOURS, [
        req.params.branchId,
        JSON.stringify(validated),
    ]);

    res.json(requireRow(updated, "branch"));
};

// ========================================

const updateUnavailableProducts = async (req: Request<BranchParams>, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const { unavailable_products } = parseInput(branchUnavailableProductsSchema, req.body);
    const branchId = req.params.branchId;

    await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");

    const productIds = unique(unavailable_products);
    if (productIds.length > 0) {
        const products = await dbAll<Pick<ProductRow, "id">>(sql, QUERIES.GET.PRODUCT_IDS, [productIds]);
        if (products.length !== productIds.length) throw notFound("One or more products not found");
    }

    const updated = await dbGet<BranchRow>(sql, QUERIES.PUT.BRANCH_UNAVAILABLE_PRODUCTS, [branchId, productIds]);

    res.json(requireRow(updated, "branch"));
};

// ========================================

const markProductUnavailable = async (req: Request<BranchProductParams>, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const { branchId, productId } = req.params;

    await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");
    await getRequiredRow<ProductRow>(sql, QUERIES.GET.PRODUCT_BY_ID, productId, "product");

    const updated = await dbGet<BranchRow>(sql, QUERIES.PUT.BRANCH_UNAVAILABLE_PRODUCT, [branchId, productId]);

    res.json(requireRow(updated, "branch"));
};

// ========================================

const restoreProductAvailability = async (req: Request<BranchProductParams>, res: Response<BranchRow>): Promise<void> => {
    await requireBranchManager(req);
    const { branchId, productId } = req.params;

    await getRequiredRow<BranchRow>(sql, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");
    await getRequiredRow<ProductRow>(sql, QUERIES.GET.PRODUCT_BY_ID, productId, "product");

    const updated = await dbGet<BranchRow>(sql, QUERIES.DELETE.BRANCH_UNAVAILABLE_PRODUCT, [branchId, productId]);

    res.json(requireRow(updated, "branch"));
};

// ========================================

const deleteBranch = async (req: Request<BranchParams>, res: Response<DeleteResponse>): Promise<void> => {
    await requireBranchManager(req);
    res.json(await deleteById(sql, QUERIES.DELETE.BRANCH, req.params.branchId, "branch"));
};

// ========================================

export default router;
