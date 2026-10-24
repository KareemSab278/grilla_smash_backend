/*
    BUSINESS ROUTES - ONE BUSINESS PER DEPLOYMENT.

    GET  /business              the business, or null when it has not been created yet
    POST /business              create it (400 if one already exists, also enforced by a unique index)
                                the response carries the generated business_key ONCE, only its sha256 hash is stored
    PUT  /business/:businessId  partial update
*/

import { randomBytes } from "node:crypto";
import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbGet, transaction } from "../database/db";
import { badRequest } from "../helpers/errors";
import { newId, orNull, requireRow } from "../helpers/helpers";
import { hashKey } from "../security/keys";
import { parseInput } from "../middleware/validate";
import { businessCreateSchema, businessUpdateSchema } from "../database/schemas";
import type { BusinessRow, CreateBusinessResponse } from "../types";

const router = express.Router();

router.get("/business", async (req, res) => await getBusiness(req, res));
router.post("/business", async (req, res) => await createBusiness(req, res));
router.put("/business/:businessId", async (req, res) => await updateBusiness(req, res));

// ========================================

const getBusiness = async (_req: Request, res: Response<BusinessRow | null>): Promise<void> => {
    const business = (await dbGet<BusinessRow>(sql, QUERIES.GET.BUSINESS)) ?? null;

    res.json(business);
};

// ========================================

// one business per deployment (also enforced by a unique index, so concurrent creates cannot slip through)
const createBusiness = async (req: Request, res: Response<CreateBusinessResponse>): Promise<void> => {
    const data = parseInput(businessCreateSchema, req.body);
    const businessKey = randomBytes(32).toString("hex");

    const business = await transaction(async tx => {
        if (await dbGet(tx, QUERIES.GET.BUSINESS_ID)) throw badRequest("Business already exists");

        const created = await dbGet<BusinessRow>(tx, QUERIES.POST.BUSINESS, [
            newId(),
            data.name,
            data.slug,
            orNull(data.logo_url),
            data.currency,
            hashKey(businessKey),
        ]);

        return requireRow(created, "business");
    });

    res.json({ ...business, business_key: businessKey });
};

// ========================================

const updateBusiness = async (req: Request<{ businessId: string }>, res: Response<BusinessRow>): Promise<void> => {
    const data = parseInput(businessUpdateSchema, req.body);

    const updated = await dbGet<BusinessRow>(sql, QUERIES.PUT.BUSINESS, [
        orNull(data.name),
        orNull(data.slug),
        orNull(data.logo_url),
        orNull(data.currency),
        orNull(data.active),
        req.params.businessId,
    ]);

    res.json(requireRow(updated, "business"));
};

// ========================================

export default router;
