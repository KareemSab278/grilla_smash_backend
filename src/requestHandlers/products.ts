/*
    PRODUCT ROUTES - PRODUCTS ALWAYS COME BACK WITH THEIR CATEGORIES.

    GET    /products                 optional ?active_only=true
    GET    /products/:productId
    POST   /products                 category_ids links the product to existing categories
    PUT    /products/:productId      partial update, category_ids (when sent) REPLACES the whole list
    DELETE /products/:productId
    Price is an integer in pence.
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbAll, dbGet, dbRun, transaction } from "../database/db";
import type { Db } from "../database/db";
import { badRequest } from "../helpers/errors";
import { deleteById, getRequiredRow, groupBy, newId, orNull, requireRow, unique } from "../helpers/helpers";
import { parseInput } from "../middleware/validate";
import { productCreateSchema, productListQuerySchema, productUpdateSchema } from "../database/schemas";
import type { CategoryRow, DeleteResponse, ProductCategoryJoinRow, ProductResponse, ProductRow } from "../types";

const router = express.Router();

router.get("/products", async (req, res) => await listProducts(req, res));
router.get("/products/:productId", async (req, res) => await getProduct(req, res));
router.post("/products", async (req, res) => await createProduct(req, res));
router.put("/products/:productId", async (req, res) => await updateProduct(req, res));
router.delete("/products/:productId", async (req, res) => await deleteProduct(req, res));

// ========================================

type ProductParams = { productId: string };

// ========================================

const stripJoinColumn = ({ product_id: _productId, ...category }: ProductCategoryJoinRow): CategoryRow => category;

const loadProduct = async (db: Db, productId: string): Promise<ProductResponse> => {
    const [product, categories] = await Promise.all([
        getRequiredRow<ProductRow>(db, QUERIES.GET.PRODUCT_BY_ID, productId, "product"),
        dbAll<ProductCategoryJoinRow>(db, QUERIES.GET.PRODUCT_CATEGORIES, [productId]),
    ]);

    return { ...product, categories: categories.map(stripJoinColumn) };
};

const assertCategoriesExist = async (db: Db, categoryIds: readonly string[]): Promise<void> => {
    for (const categoryId of categoryIds) {
        if (!(await dbGet(db, QUERIES.GET.CATEGORY_BY_ID, [categoryId]))) {
            throw badRequest(`Category ${categoryId} does not exist`);
        }
    }
};

const linkCategories = async (db: Db, productId: string, categoryIds: readonly string[]): Promise<void> => {
    for (const categoryId of categoryIds) {
        await dbRun(db, QUERIES.POST.PRODUCT_CATEGORY, [productId, categoryId]);
    }
};

// ========================================

const listProducts = async (req: Request, res: Response<ProductResponse[]>): Promise<void> => {
    const { active_only: activeOnly } = parseInput(productListQuerySchema, req.query);

    // one query for every product's categories instead of one per product
    const [products, categoryLinks] = await Promise.all([
        dbAll<ProductRow>(sql, activeOnly ? QUERIES.GET.ACTIVE_PRODUCTS : QUERIES.GET.PRODUCTS),
        dbAll<ProductCategoryJoinRow>(sql, QUERIES.GET.PRODUCT_CATEGORIES, [null]),
    ]);

    const categoriesByProduct = groupBy(categoryLinks, row => row.product_id);

    res.json(
        products.map(product => ({
            ...product,
            categories: (categoriesByProduct.get(product.id) ?? []).map(stripJoinColumn),
        }))
    );
};

// ========================================

const getProduct = async (req: Request<ProductParams>, res: Response<ProductResponse>): Promise<void> => {
    res.json(await loadProduct(sql, req.params.productId));
};

// ========================================

const createProduct = async (req: Request, res: Response<ProductResponse>): Promise<void> => {
    const data = parseInput(productCreateSchema, req.body);
    const categoryIds = unique(data.category_ids);
    const productId = newId();

    const product = await transaction(async tx => {
        await assertCategoriesExist(tx, categoryIds);

        await dbRun(tx, QUERIES.POST.PRODUCT, [
            productId,
            data.name,
            orNull(data.description),
            data.price,
            orNull(data.image_url),
            data.sort_order,
            data.ingredients,
        ]);

        await linkCategories(tx, productId, categoryIds);

        return await loadProduct(tx, productId);
    });

    res.json(product);
};

// ========================================

const updateProduct = async (req: Request<ProductParams>, res: Response<ProductResponse>): Promise<void> => {
    const { productId } = req.params;
    const data = parseInput(productUpdateSchema, req.body);

    const product = await transaction(async tx => {
        const updated = await dbGet(tx, QUERIES.PUT.PRODUCT, [
            orNull(data.name),
            orNull(data.description),
            orNull(data.price),
            orNull(data.image_url),
            orNull(data.sort_order),
            orNull(data.active),
            orNull(data.ingredients),
            productId,
        ]);

        requireRow(updated, "product");

        // categories are replaced as a whole when provided, left alone when omitted
        if (data.category_ids) {
            const categoryIds = unique(data.category_ids);

            await assertCategoriesExist(tx, categoryIds);
            await dbRun(tx, QUERIES.DELETE.PRODUCT_CATEGORIES, [productId]);
            await linkCategories(tx, productId, categoryIds);
        }

        return await loadProduct(tx, productId);
    });

    res.json(product);
};

// ========================================

const deleteProduct = async (req: Request<ProductParams>, res: Response<DeleteResponse>): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.PRODUCT, req.params.productId, "product"));
};

// ========================================

export default router;
