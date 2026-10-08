import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbRun, transaction } from "../db";
import { getRequiredRow, groupBy } from "../helpers";
import { parseInput } from "../middleware/validate";
import { productModifierGroupSchema } from "../schemas";
import type {
    AttachModifierGroupResponse,
    ModifierGroupResponse,
    ModifierGroupRow,
    ModifierRow,
    ProductRow,
    SuccessResponse,
} from "../types";

const router = express.Router();

router.get("/products/:productId/modifier-groups", async (req, res) => await getProductModifierGroups(req, res));
router.post("/products/:productId/modifier-groups", async (req, res) => await attachModifierGroup(req, res));
router.delete(
    "/products/:productId/modifier-groups/:groupId",
    async (req, res) => await detachModifierGroup(req, res)
);

// ========================================

type ProductParams = { productId: string };

// ========================================

// only active modifiers are returned, this is what the storefront renders
const getProductModifierGroups = async (
    req: Request<ProductParams>,
    res: Response<ModifierGroupResponse[]>
): Promise<void> => {
    const { productId } = req.params;

    await getRequiredRow<ProductRow>(sql, QUERIES.GET.PRODUCT_BY_ID, productId, "product");

    const [groups, modifiers] = await Promise.all([
        dbAll<ModifierGroupRow>(sql, QUERIES.GET.PRODUCT_MODIFIER_GROUPS, [productId]),
        dbAll<ModifierRow>(sql, QUERIES.GET.PRODUCT_ACTIVE_MODIFIERS, [productId]),
    ]);

    const modifiersByGroup = groupBy(modifiers, modifier => modifier.modifier_group_id);

    res.json(groups.map(group => ({ ...group, modifiers: modifiersByGroup.get(group.id) ?? [] })));
};

// ========================================

const attachModifierGroup = async (
    req: Request<ProductParams>,
    res: Response<AttachModifierGroupResponse>
): Promise<void> => {
    const { productId } = req.params;
    const data = parseInput(productModifierGroupSchema, req.body);

    await transaction(async tx => {
        await getRequiredRow<ProductRow>(tx, QUERIES.GET.PRODUCT_BY_ID, productId, "product");
        await getRequiredRow<ModifierGroupRow>(
            tx,
            QUERIES.GET.MODIFIER_GROUP_BY_ID,
            data.modifier_group_id,
            "modifier group"
        );

        await dbRun(tx, QUERIES.PUT.PRODUCT_MODIFIER_GROUP, [productId, data.modifier_group_id, data.sort_order]);
    });

    res.json({ success: true, product_id: productId, modifier_group_id: data.modifier_group_id });
};

// ========================================

const detachModifierGroup = async (
    req: Request<ProductParams & { groupId: string }>,
    res: Response<SuccessResponse>
): Promise<void> => {
    const { productId, groupId } = req.params;

    await dbRun(sql, QUERIES.DELETE.PRODUCT_MODIFIER_GROUP, [productId, groupId]);

    res.json({ success: true });
};

// ========================================

export default router;
