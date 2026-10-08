/*
    MODIFIER GROUP ROUTES - e.g. "Sauces", "Size", "Extras". Groups come back with their modifiers.

    GET    /modifier-groups
    GET    /modifier-groups/:groupId
    POST   /modifier-groups
    PUT    /modifier-groups/:groupId   min/max are validated against the stored values (row is locked)
    DELETE /modifier-groups/:groupId   deletes its modifiers too
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbRun, transaction } from "../db";
import type { Db } from "../db";
import { badRequest } from "../errors";
import { deleteById, getRequiredRow, groupBy, newId, orNull } from "../helpers";
import { parseInput } from "../middleware/validate";
import { modifierGroupCreateSchema, modifierGroupUpdateSchema } from "../schemas";
import type { DeleteResponse, ModifierGroupResponse, ModifierGroupRow, ModifierRow } from "../types";

const router = express.Router();

router.get("/modifier-groups", async (req, res) => await listModifierGroups(req, res));
router.get("/modifier-groups/:groupId", async (req, res) => await getModifierGroup(req, res));
router.post("/modifier-groups", async (req, res) => await createModifierGroup(req, res));
router.put("/modifier-groups/:groupId", async (req, res) => await updateModifierGroup(req, res));
router.delete("/modifier-groups/:groupId", async (req, res) => await deleteModifierGroup(req, res));

// ========================================

type ModifierGroupParams = { groupId: string };

const MIN_MAX_ERROR = "min_selections cannot exceed max_selections";

// ========================================

const loadModifierGroup = async (db: Db, groupId: string): Promise<ModifierGroupResponse> => {
    const [group, modifiers] = await Promise.all([
        getRequiredRow<ModifierGroupRow>(db, QUERIES.GET.MODIFIER_GROUP_BY_ID, groupId, "modifier group"),
        dbAll<ModifierRow>(db, QUERIES.GET.MODIFIERS_BY_GROUP, [groupId]),
    ]);

    return { ...group, modifiers };
};

// ========================================

const listModifierGroups = async (_req: Request, res: Response<ModifierGroupResponse[]>): Promise<void> => {
    // one query for every group's modifiers instead of one per group
    const [groups, modifiers] = await Promise.all([
        dbAll<ModifierGroupRow>(sql, QUERIES.GET.MODIFIER_GROUPS),
        dbAll<ModifierRow>(sql, QUERIES.GET.MODIFIERS_BY_GROUP, [null]),
    ]);

    const modifiersByGroup = groupBy(modifiers, modifier => modifier.modifier_group_id);

    res.json(groups.map(group => ({ ...group, modifiers: modifiersByGroup.get(group.id) ?? [] })));
};

// ========================================

const getModifierGroup = async (
    req: Request<ModifierGroupParams>,
    res: Response<ModifierGroupResponse>
): Promise<void> => {
    res.json(await loadModifierGroup(sql, req.params.groupId));
};

// ========================================

const createModifierGroup = async (req: Request, res: Response<ModifierGroupResponse>): Promise<void> => {
    const data = parseInput(modifierGroupCreateSchema, req.body);

    if (data.min_selections > data.max_selections) throw badRequest(MIN_MAX_ERROR);

    const groupId = newId();

    await dbRun(sql, QUERIES.POST.MODIFIER_GROUP, [
        groupId,
        data.name,
        data.required,
        data.min_selections,
        data.max_selections,
        data.sort_order,
    ]);

    res.json(await loadModifierGroup(sql, groupId));
};

// ========================================

const updateModifierGroup = async (
    req: Request<ModifierGroupParams>,
    res: Response<ModifierGroupResponse>
): Promise<void> => {
    const { groupId } = req.params;
    const data = parseInput(modifierGroupUpdateSchema, req.body);

    const group = await transaction(async tx => {
        // row is locked so the merged min/max check cannot race with another update
        const existing = await getRequiredRow<ModifierGroupRow>(
            tx,
            QUERIES.GET.MODIFIER_GROUP_FOR_UPDATE,
            groupId,
            "modifier group"
        );

        const minSelections = data.min_selections ?? existing.min_selections;
        const maxSelections = data.max_selections ?? existing.max_selections;

        if (minSelections > maxSelections) throw badRequest(MIN_MAX_ERROR);

        await dbRun(tx, QUERIES.PUT.MODIFIER_GROUP, [
            orNull(data.name),
            orNull(data.required),
            minSelections,
            maxSelections,
            orNull(data.sort_order),
            orNull(data.active),
            groupId,
        ]);

        return await loadModifierGroup(tx, groupId);
    });

    res.json(group);
};

// ========================================

const deleteModifierGroup = async (
    req: Request<ModifierGroupParams>,
    res: Response<DeleteResponse>
): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.MODIFIER_GROUP, req.params.groupId, "modifier group"));
};

// ========================================

export default router;
