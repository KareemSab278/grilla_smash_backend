import express from "express";
import sql, { dbAll, dbGet, dbRun, transaction } from "../database/db";
import type { Db } from "../database/db";
import { mealUpgradeCreateSchema, mealUpgradeUpdateSchema } from "../database/schemas";
import type { MealUpgradeCreate, MealUpgradeUpdate } from "../database/schemas";
import { badRequest } from "../helpers/errors";
import { deleteById, getRequiredRow, groupBy, newId, orNull, requireRow, unique } from "../helpers/helpers";
import { parseInput } from "../middleware/validate";
import { QUERIES } from "../queries/queries";

type UpgradeRow = { id: string; name: string; upgrade_price: number; active: boolean; sort_order: number };
type MainRow = { meal_upgrade_id: string; product_id: string };
type GroupRow = {
    id: string; meal_upgrade_id: string; name: string;
    min_selections: number; max_selections: number; sort_order: number;
};
type ChoiceRow = {
    id: string; group_id: string; product_id: string; surcharge: number; active: boolean; sort_order: number;
};
type MealUpgrade = UpgradeRow & {
    main_product_ids: string[];
    groups: (GroupRow & { choices: ChoiceRow[] })[];
};

const Q = QUERIES.MEAL_UPGRADES;

const buildUpgrades = async (db: Db, rows: UpgradeRow[], id: string | null): Promise<MealUpgrade[]> => {
    const [mains, groups, choices] = await Promise.all([
        dbAll<MainRow>(db, Q.mains, [id]),
        dbAll<GroupRow>(db, Q.groups, [id]),
        dbAll<ChoiceRow>(db, Q.choices, [id]),
    ]);
    const mainsByUpgrade = groupBy(mains, main => main.meal_upgrade_id);
    const groupsByUpgrade = groupBy(groups, group => group.meal_upgrade_id);
    const choicesByGroup = groupBy(choices, choice => choice.group_id);
    return rows.map(row => ({
        ...row,
        main_product_ids: (mainsByUpgrade.get(row.id) ?? []).map(main => main.product_id),
        groups: (groupsByUpgrade.get(row.id) ?? []).map(group => ({
            ...group,
            choices: choicesByGroup.get(group.id) ?? [],
        })),
    }));
};

const loadUpgrade = async (db: Db, id: string): Promise<MealUpgrade> => {
    const row = await getRequiredRow<UpgradeRow>(db, Q.byId, id, "meal upgrade");
    return requireRow((await buildUpgrades(db, [row], id))[0], "meal upgrade");
};

const validateProducts = async (db: Db, data: MealUpgradeUpdate): Promise<void> => {
    const ids = unique([
        ...(data.main_product_ids ?? []),
        ...(data.groups ?? []).flatMap(group => group.choices.map(choice => choice.product_id)),
    ]);
    for (const productId of ids) {
        if (!(await dbGet(db, QUERIES.GET.PRODUCT_BY_ID, [productId]))) {
            throw badRequest(`Product ${productId} does not exist`);
        }
    }
};

const writeChildren = async (db: Db, upgradeId: string, data: MealUpgradeUpdate): Promise<void> => {
    await validateProducts(db, data);
    if (data.main_product_ids) {
        await dbRun(db, Q.deleteMains, [upgradeId]);
        for (const productId of data.main_product_ids) await dbRun(db, Q.insertMain, [upgradeId, productId]);
    }
    if (data.groups) {
        const existing = await dbAll<GroupRow>(db, Q.groups, [upgradeId]);
        const existingIds = new Set(existing.map(group => group.id));
        for (const group of data.groups) {
            if (group.id && !existingIds.has(group.id)) {
                throw badRequest(`Group ${group.id} does not belong to this meal upgrade`);
            }
        }
        const retainedIds = data.groups.flatMap(group => group.id ? [group.id] : []);
        await dbRun(db, Q.deleteGroupsExcept, [upgradeId, retainedIds]);
        for (const group of data.groups) {
            const groupId = group.id ?? newId();
            const params = [groupId, upgradeId, group.name, group.min_selections, group.max_selections, group.sort_order] as const;
            if (group.id) requireRow(await dbGet(db, Q.updateGroup, params), "meal upgrade group");
            else await dbRun(db, Q.insertGroup, params);
            await dbRun(db, Q.deleteChoicesExcept, [groupId, group.choices.map(choice => choice.product_id)]);
            for (const choice of group.choices) {
                await dbRun(db, Q.upsertChoice, [
                    newId(), groupId, choice.product_id, choice.surcharge, orNull(choice.active), choice.sort_order,
                ]);
            }
        }
    }
};

type Store = {
    db: Db;
    transaction: <T>(work: (tx: Db) => Promise<T>) => Promise<T>;
};

export const createMealUpgradeRouter = (store: Store) => {
    const router = express.Router();

    router.get("/meal-upgrades", async (_req, res) => {
        const rows = await dbAll<UpgradeRow>(store.db, Q.list);
        res.json(await buildUpgrades(store.db, rows, null));
    });

    router.get("/meal-upgrades/:id", async (req, res) => {
        res.json(await loadUpgrade(store.db, req.params.id));
    });

    router.post("/meal-upgrades", async (req, res) => {
        const data: MealUpgradeCreate = parseInput(mealUpgradeCreateSchema, req.body);
        if (data.groups.some(group => group.id)) throw badRequest("New groups must not specify an ID");
        const id = newId();
        const created = await store.transaction(async tx => {
            await dbRun(tx, Q.insert, [id, data.name, data.upgrade_price, data.active, data.sort_order]);
            await writeChildren(tx, id, data);
            return loadUpgrade(tx, id);
        });
        res.json(created);
    });

    router.put("/meal-upgrades/:id", async (req, res) => {
        const data = parseInput(mealUpgradeUpdateSchema, req.body);
        const updated = await store.transaction(async tx => {
            requireRow(await dbGet(tx, Q.update, [
                req.params.id, orNull(data.name), orNull(data.upgrade_price), orNull(data.active), orNull(data.sort_order),
            ]), "meal upgrade");
            await writeChildren(tx, req.params.id, data);
            return loadUpgrade(tx, req.params.id);
        });
        res.json(updated);
    });

    router.delete("/meal-upgrades/:id", async (req, res) => {
        res.json(await deleteById(store.db, Q.delete, req.params.id, "meal upgrade"));
    });

    return router;
};

export default createMealUpgradeRouter({ db: sql, transaction });
