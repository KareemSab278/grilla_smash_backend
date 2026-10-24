/*
    MODIFIER ROUTES - THE INDIVIDUAL OPTIONS INSIDE A GROUP (e.g. "Mayo", "Large").

    POST   /modifier-groups/:groupId/modifiers
    PUT    /modifiers/:modifierId
    DELETE /modifiers/:modifierId
    Price is the extra cost in pence.
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbGet } from "../database/db";
import { deleteById, getRequiredRow, newId, orNull, requireRow } from "../helpers/helpers";
import { parseInput } from "../middleware/validate";
import { modifierCreateSchema, modifierUpdateSchema } from "../database/schemas";
import type { DeleteResponse, ModifierGroupRow, ModifierRow } from "../types";

const router = express.Router();

router.post("/modifier-groups/:groupId/modifiers", async (req, res) => await createModifier(req, res));
router.put("/modifiers/:modifierId", async (req, res) => await updateModifier(req, res));
router.delete("/modifiers/:modifierId", async (req, res) => await deleteModifier(req, res));

// ========================================

type ModifierParams = { modifierId: string };

// ========================================

const createModifier = async (req: Request<{ groupId: string }>, res: Response<ModifierRow>): Promise<void> => {
    const { groupId } = req.params;
    const data = parseInput(modifierCreateSchema, req.body);

    await getRequiredRow<ModifierGroupRow>(sql, QUERIES.GET.MODIFIER_GROUP_BY_ID, groupId, "modifier group");

    const created = await dbGet<ModifierRow>(sql, QUERIES.POST.MODIFIER, [
        newId(),
        groupId,
        data.name,
        data.price,
        data.sort_order,
    ]);

    res.json(requireRow(created, "modifier"));
};

// ========================================

const updateModifier = async (req: Request<ModifierParams>, res: Response<ModifierRow>): Promise<void> => {
    const data = parseInput(modifierUpdateSchema, req.body);

    const updated = await dbGet<ModifierRow>(sql, QUERIES.PUT.MODIFIER, [
        orNull(data.name),
        orNull(data.price),
        orNull(data.sort_order),
        orNull(data.active),
        req.params.modifierId,
    ]);

    res.json(requireRow(updated, "modifier"));
};

// ========================================

const deleteModifier = async (req: Request<ModifierParams>, res: Response<DeleteResponse>): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.MODIFIER, req.params.modifierId, "modifier"));
};

// ========================================

export default router;
