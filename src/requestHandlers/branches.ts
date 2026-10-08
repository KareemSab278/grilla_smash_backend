import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbGet } from "../db";
import { deleteById, getRequiredRow, newId, orNull, requireRow } from "../helpers";
import { parseInput } from "../middleware/validate";
import { branchCreateSchema, branchUpdateSchema } from "../schemas";
import type { BranchRow, DeleteResponse } from "../types";

const router = express.Router();

router.get("/branches", async (req, res) => await listBranches(req, res));
router.get("/branches/:branchId", async (req, res) => await getBranch(req, res));
router.post("/branches", async (req, res) => await createBranch(req, res));
router.put("/branches/:branchId", async (req, res) => await updateBranch(req, res));
router.delete("/branches/:branchId", async (req, res) => await deleteBranch(req, res));

// ========================================

type BranchParams = { branchId: string };

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
    ]);

    res.json(requireRow(created, "branch"));
};

// ========================================

const updateBranch = async (req: Request<BranchParams>, res: Response<BranchRow>): Promise<void> => {
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

// ========================================

const deleteBranch = async (req: Request<BranchParams>, res: Response<DeleteResponse>): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.BRANCH, req.params.branchId, "branch"));
};

// ========================================

export default router;
