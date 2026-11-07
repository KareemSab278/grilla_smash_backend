/*
    OFFER ROUTES - CONFIGURABLE BUNDLES / DISCOUNTS (offer -> rules -> products + modifier groups + modifiers).

    GET    /offers
    GET    /offers/:offerId
    POST   /offers
    PUT    /offers/:offerId   partial update, rules (when sent) REPLACE all existing rules
    DELETE /offers/:offerId
    Rules are validated before anything is written (products / groups / modifiers must exist, modifiers must
    belong to the group, min <= max, required needs min >= 1). Everything is saved in one transaction.
    Offers are applied by POST /orders (see requestHandlers/orders.ts + offerPricing.ts).
    A rule modifier group without restricted modifiers lists every active modifier of the group in responses.
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbAll, dbGet, dbRun, transaction } from "../database/db";
import type { Db } from "../database/db";
import { badRequest } from "../helpers/errors";
import { deleteById, findDuplicate, getRequiredRow, groupBy, newId, orNull, requireRow, unique } from "../helpers/helpers";
import { parseInput } from "../middleware/validate";
import { offerCreateSchema, offerUpdateSchema } from "../database/schemas";
import type { OfferRuleInput } from "../database/schemas";
import type {
    DeleteResponse,
    ModifierGroupRow,
    ModifierRow,
    OfferResponse,
    OfferRow,
    OfferRuleGroupJoinRow,
    OfferRuleModifierGroupResponse,
    OfferRuleModifierJoinRow,
    OfferRuleProductJoinRow,
    OfferRuleResponse,
    OfferRuleRow,
    ProductRow,
} from "../types";

const router = express.Router();

router.get("/offers", async (req, res) => await listOffers(req, res));
router.get("/offers/:offerId", async (req, res) => await getOffer(req, res));
router.post("/offers", async (req, res) => await createOffer(req, res));
router.put("/offers/:offerId", async (req, res) => await updateOffer(req, res));
router.delete("/offers/:offerId", async (req, res) => await deleteOffer(req, res));

// ========================================

type OfferParams = { offerId: string };

// ========================================
// READ
// ========================================

const stripRuleId = <T extends { offer_rule_id: string }>({ offer_rule_id: _ruleId, ...row }: T): Omit<T, "offer_rule_id"> => row;

const toRuleGroup = (
    { offer_required, offer_min_selections, offer_max_selections, ...group }: Omit<OfferRuleGroupJoinRow, "offer_rule_id">,
    modifiers: ModifierRow[]
): OfferRuleModifierGroupResponse => ({
    ...group,
    required: offer_required,
    min_selections: offer_min_selections,
    max_selections: offer_max_selections,
    modifiers,
});

// offerId = null loads the rules of every offer. Each child table is fetched once and stitched together in memory
const buildOffers = async (db: Db, offers: readonly OfferRow[], offerId: string | null): Promise<OfferResponse[]> => {
    const [rules, ruleProducts, ruleGroups, ruleModifiers] = await Promise.all([
        dbAll<OfferRuleRow>(db, QUERIES.GET.OFFER_RULES, [offerId]),
        dbAll<OfferRuleProductJoinRow>(db, QUERIES.GET.OFFER_RULE_PRODUCTS, [offerId]),
        dbAll<OfferRuleGroupJoinRow>(db, QUERIES.GET.OFFER_RULE_GROUPS, [offerId]),
        dbAll<OfferRuleModifierJoinRow>(db, QUERIES.GET.OFFER_RULE_MODIFIERS, [offerId]),
    ]);

    const rulesByOffer = groupBy(rules, rule => rule.offer_id);
    const productsByRule = groupBy(ruleProducts, product => product.offer_rule_id);
    const groupsByRule = groupBy(ruleGroups, group => group.offer_rule_id);
    const modifiersByRuleGroup = groupBy(ruleModifiers, modifier => `${modifier.offer_rule_id}:${modifier.modifier_group_id}`);

    // a rule group with no restriction offers every active modifier of the group
    const unrestrictedGroupIds = unique(
        ruleGroups
            .filter(group => !modifiersByRuleGroup.has(`${group.offer_rule_id}:${group.id}`))
            .map(group => group.id)
    );
    const groupModifiers =
        unrestrictedGroupIds.length > 0
            ? await dbAll<ModifierRow>(db, QUERIES.GET.ACTIVE_MODIFIERS_BY_GROUPS, [unrestrictedGroupIds])
            : [];
    const modifiersByGroup = groupBy(groupModifiers, modifier => modifier.modifier_group_id);

    return offers.map(offer => ({
        ...offer,
        rules: (rulesByOffer.get(offer.id) ?? []).map(
            (rule): OfferRuleResponse => ({
                ...rule,
                products: (productsByRule.get(rule.id) ?? []).map(stripRuleId),
                modifier_groups: (groupsByRule.get(rule.id) ?? []).map(group =>
                    toRuleGroup(
                        stripRuleId(group),
                        modifiersByRuleGroup.get(`${rule.id}:${group.id}`)?.map(stripRuleId) ?? modifiersByGroup.get(group.id) ?? []
                    )
                ),
            })
        ),
    }));
};

// BUY_X_GET_Y offers are applied to orders automatically, so orders need all of the active ones
export const loadAutomaticOffers = async (db: Db): Promise<OfferResponse[]> => {
    const offers = (await dbAll<OfferRow>(db, QUERIES.GET.OFFERS)).filter(offer => offer.active && offer.type === "BUY_X_GET_Y");

    return offers.length > 0 ? buildOffers(db, offers, null) : [];
};

export const loadOffer = async (db: Db, offerId: string): Promise<OfferResponse> => {
    const offer = await getRequiredRow<OfferRow>(db, QUERIES.GET.OFFER_BY_ID, offerId, "offer");

    const [built] = await buildOffers(db, [offer], offerId);
    if (!built) throw new Error(`Failed to build offer ${offerId}`);

    return built;
};

// ========================================
// WRITE
// ========================================

const validateRules = async (db: Db, rules: readonly OfferRuleInput[]): Promise<void> => {
    for (const rule of rules) {
        for (const productId of rule.product_ids) {
            const product = await getRequiredRow<ProductRow>(db, QUERIES.GET.PRODUCT_BY_ID, productId, "product");
            if (!product.active) {
                throw badRequest(`Product ${productId} is inactive and cannot be added to an offer.`);
            }
        }

        const duplicateGroup = findDuplicate(rule.modifier_groups.map(group => group.modifier_group_id));
        if (duplicateGroup) {
            throw badRequest(`Modifier group ${duplicateGroup} is listed more than once in rule '${rule.name}'.`);
        }

        for (const group of rule.modifier_groups) {
            await getRequiredRow<ModifierGroupRow>(
                db,
                QUERIES.GET.MODIFIER_GROUP_BY_ID,
                group.modifier_group_id,
                "modifier group"
            );

            if (group.min_selections > group.max_selections) {
                throw badRequest(`Minimum selections cannot exceed maximum selections in rule '${rule.name}'.`);
            }

            if (group.required && group.min_selections < 1) {
                throw badRequest(`Required modifier groups must have at least 1 minimum selection in rule '${rule.name}'.`);
            }

            for (const modifierId of group.modifier_ids) {
                const modifier = await getRequiredRow<ModifierRow>(db, QUERIES.GET.MODIFIER_BY_ID, modifierId, "modifier");

                if (modifier.modifier_group_id !== group.modifier_group_id) {
                    throw badRequest(`Modifier ${modifierId} does not belong to modifier group ${group.modifier_group_id}.`);
                }
            }
        }
    }
};

const insertRules = async (db: Db, offerId: string, rules: readonly OfferRuleInput[]): Promise<void> => {
    for (const rule of rules) {
        const ruleId = newId();

        await dbRun(db, QUERIES.POST.OFFER_RULE, [ruleId, offerId, rule.name, rule.quantity, rule.sort_order]);

        for (const productId of unique(rule.product_ids)) {
            await dbRun(db, QUERIES.POST.OFFER_RULE_PRODUCT, [ruleId, productId]);
        }

        for (const group of rule.modifier_groups) {
            await dbRun(db, QUERIES.POST.OFFER_RULE_GROUP, [
                ruleId,
                group.modifier_group_id,
                group.required,
                group.min_selections,
                group.max_selections,
            ]);

            for (const modifierId of unique(group.modifier_ids)) {
                await dbRun(db, QUERIES.POST.OFFER_RULE_MODIFIER, [ruleId, group.modifier_group_id, modifierId]);
            }
        }
    }
};

// ========================================

const listOffers = async (_req: Request, res: Response<OfferResponse[]>): Promise<void> => {
    const offers = await dbAll<OfferRow>(sql, QUERIES.GET.OFFERS);

    res.json(await buildOffers(sql, offers, null));
};

// ========================================

const getOffer = async (req: Request<OfferParams>, res: Response<OfferResponse>): Promise<void> => {
    res.json(await loadOffer(sql, req.params.offerId));
};

// ========================================

const createOffer = async (req: Request, res: Response<OfferResponse>): Promise<void> => {
    const data = parseInput(offerCreateSchema, req.body);
    const offerId = newId();

    const offer = await transaction(async tx => {
        await validateRules(tx, data.rules);

        await dbRun(tx, QUERIES.POST.OFFER, [
            offerId,
            data.name,
            orNull(data.description),
            data.type,
            orNull(data.price),
            orNull(data.percentage),
            orNull(data.discount_amount),
            orNull(data.starts_at),
            orNull(data.ends_at),
            data.sort_order,
            data.active,
        ]);

        await insertRules(tx, offerId, data.rules);

        return await loadOffer(tx, offerId);
    });

    res.json(offer);
};

// ========================================

const updateOffer = async (req: Request<OfferParams>, res: Response<OfferResponse>): Promise<void> => {
    const { offerId } = req.params;
    const data = parseInput(offerUpdateSchema, req.body);

    const offer = await transaction(async tx => {
        const updated = await dbGet(tx, QUERIES.PUT.OFFER, [
            orNull(data.name),
            orNull(data.description),
            orNull(data.type),
            orNull(data.price),
            orNull(data.percentage),
            orNull(data.discount_amount),
            orNull(data.starts_at),
            orNull(data.ends_at),
            orNull(data.sort_order),
            orNull(data.active),
            offerId,
        ]);

        requireRow(updated, "offer");

        // rules are replaced as a whole when provided, left alone when omitted
        if (data.rules) {
            await validateRules(tx, data.rules);
            await dbRun(tx, QUERIES.DELETE.OFFER_RULES, [offerId]);
            await insertRules(tx, offerId, data.rules);
        }

        return await loadOffer(tx, offerId);
    });

    res.json(offer);
};

// ========================================

const deleteOffer = async (req: Request<OfferParams>, res: Response<DeleteResponse>): Promise<void> => {
    res.json(await deleteById(sql, QUERIES.DELETE.OFFER, req.params.offerId, "offer"));
};

// ========================================

export default router;
