/*
    CATEGORY ROUTES

    GET    /categories              by sort_order, then name
    GET    /categories/:categoryId
    POST   /categories
    PUT    /categories/:categoryId  partial update
    DELETE /categories/:categoryId  products stay, only the link is removed
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbGet } from "../db";
import { deleteById, getRequiredRow, newId, orNull, requireRow } from "../helpers";
import { parseInput } from "../middleware/validate";
import { categoryCreateSchema, categoryUpdateSchema } from "../schemas";
import type { CategoryRow, DeleteResponse } from "../types";

const router = express.Router();

router.get("/categories", async (req, res) => await listCategories(req, res));
router.get("/categories/:categoryId", async (req, res) => await getCategory(req, res));
router.post("/categories", async (req, res) => await createCategory(req, res));
router.put("/categories/:categoryId", async (req, res) => await updateCategory(req, res));
router.delete("/categories/:categoryId", async (req, res) => await deleteCategory(req, res));

// ========================================

type CategoryParams = { categoryId: string };

// ========================================

const listCategories = async (_req: Request, res: Response<CategoryRow[]>): Promise<void> => {
    res.json(await dbAll<CategoryRow>(sql, QUERIES.GET.CATEGORIES));
};

// ========================================

const getCategory = async (req: Request<CategoryParams>, res: Response<CategoryRow>): Promise<void> => {
    res.json(await getRequiredRow<CategoryRow>(sql, QUERIES.GET.CATEGORY_BY_ID, req.params.categoryId, "category"));
};

// ========================================

const createCategory = async (req: Request, res: Response<CategoryRow>): Promise<void> => {
    const data = parseInput(categoryCreateSchema, req.body);

    const created = await dbGet<CategoryRow>(sql, QUERIES.POST.CATEGORY, [
        newId(),
        data.name,
        orNull(data.description),
        orNull(data.image_url),
        data.sort_order,
    ]);

    res.json(requireRow(created, "category"));
};

// ========================================

const updateCategory = async (req: Request<CategoryParams>, res: Response<CategoryRow>): Promise<void> => {
    const data = parseInput(categoryUpdateSchema, req.body);

    const updated = await dbGet<CategoryRow>(sql, QUERIES.PUT.CATEGORY, [
        orNull(data.name),
        orNull(data.description),
        orNull(data.image_url),
        orNull(data.sort_order),
        orNull(data.active),
        req.params.categoryId,
    ]);

    res.json(requireRow(updated, "category"));
};

// ========================================

const deleteCategory = async (req: Request<CategoryParams>, res: Response<DeleteResponse>): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.CATEGORY, req.params.categoryId, "category"));
};

// ========================================

export default router;
