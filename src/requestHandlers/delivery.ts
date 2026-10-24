import express from "express";
import type { Request, Response } from "express";
import { calculateDeliveryPricing } from "../deliveryPricing";
import { getRequiredRow } from "../helpers";
import { parseInput } from "../middleware/validate";
import { QUERIES } from "../queries";
import sql from "../db";
import { deliveryQuoteSchema } from "../schemas";
import type { BranchRow } from "../types";

const router = express.Router();

router.post("/delivery/quote", async (req: Request, res: Response) => {
    const data = parseInput(deliveryQuoteSchema, req.body);
    const branch = await getRequiredRow<BranchRow>(
        sql,
        QUERIES.GET.BRANCH_BY_ID,
        data.branch_id,
        "branch"
    );
    const { feePence, distanceKm } = await calculateDeliveryPricing(branch, data);

    res.json({
        delivery_fee: feePence,
        distance_km: distanceKm,
    });
});

export default router;
