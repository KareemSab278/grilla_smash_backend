import express from "express";
import type { Request, Response } from "express";
import { Expo } from "expo-server-sdk";
import { QUERIES } from "../queries/queries";
import sql, { dbGet, dbRun } from "../database/db";
import type { KdsNotificationRegistration } from "../database/schemas";
import { kdsNotificationRegistrationSchema } from "../database/schemas";
import { unauthorized, unprocessable } from "../helpers/errors";
import { parseInput } from "../middleware/validate";
import type { SuccessResponse } from "../types";

const router = express.Router();

router.post("/kds/notifications/register", async (req, res) => await registerKdsNotification(req, res));

const registerKdsNotification = async (
    req: Request,
    res: Response<SuccessResponse>
): Promise<void> => {
    const data: KdsNotificationRegistration = parseInput(kdsNotificationRegistrationSchema, req.body);
    if (!Expo.isExpoPushToken(data.expoPushToken)) {
        throw unprocessable("expoPushToken is not a valid Expo push token");
    }

    const branch = await dbGet<{ id: string }>(sql, QUERIES.GET.ACTIVE_BRANCH_BY_KEY, [data.branchKey]);
    if (!branch) throw unauthorized("Invalid branch key");

    await dbRun(sql, QUERIES.POST.KDS_NOTIFICATION, [
        branch.id,
        data.deviceId,
        data.expoPushToken,
        data.platform,
    ]);

    res.json({ success: true });
};

export default router;
