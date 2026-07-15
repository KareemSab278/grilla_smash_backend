import express from "express";
import { shift4Client } from "./shift4";
import { normalizeAmount, buildCheckoutRequest } from "./helpers";

const router = express.Router();
router.post("/charge", async (req, res) => await handleCharge(req, res));
router.get("/checkout-session", async (req, res) => await getCheckoutSession(req, res));
router.post("/checkout-callback", async (req, res) => await getCheckoutCallback(req, res));

// ========================================

type healthyResponse = {
    success: boolean;
    charge_id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    error?: string;
    error_message?: string;
};

type ErrorResponse = {
    success?: false;
    error?: string;
    error_message?: Error | string;
};

// ========================================

const errorResponse = (res: express.Response, error: string, errorMessage?: string) => {
    return res.status(500).json({
        success: false,
        error,
        error_message: errorMessage,
    } as ErrorResponse);
};

// ========================================

const getCheckoutCallback = async (req: express.Request, res: express.Response) => {
    try {
        const body = req.body ?? {};
        const shift4ChargeId = body.shift4ChargeId || body.chargeId || body.id || body.charge?.id;

        if (!shift4ChargeId) {
            return res.status(400).json({ success: false, error: "Missing shift4ChargeId" });
        }

        const charge = await shift4Client.charges.get(shift4ChargeId);

        const response: healthyResponse = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to verify charge.", (err as Error).message);
    }
};

// ========================================

const getCheckoutSession = async (req: express.Request, res: express.Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const request = buildCheckoutRequest({ amount, currency });

        const clientSecret = shift4Client.checkoutRequest.sign(request);

        return res.json({ success: true, clientSecret });
    } catch (err) {
        return errorResponse(res, "Unable to create checkout session.", (err as Error).message);
    }
};

// ========================================

const handleCharge = async (req: express.Request, res: express.Response) => {
    try {
        const { amount, currency, token, card, customerId } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }
        if (!currency) {
            return res.status(400).json({ success: false, error: "Currency is required" });
        }

        const chargeParams = buildChargeParams({ amount, currency, token, card, customerId });

        if (!chargeParams.card) {
            return res.status(400).json({ success: false, error: "Card or token is required" });
        }

        const charge = await shift4Client.charges.create(chargeParams);
        const response: healthyResponse = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };

        return res.json(response);

    } catch (err) {
        errorResponse(res, "Unable to create charge.", (err as Error).message);
    }
};

// ========================================

const buildChargeParams = ({ amount, currency, token, card, customerId }: Record<string, any>) => {
    const chargeParams: Record<string, any> = {
        amount: normalizeAmount(amount),
        currency: currency.toUpperCase(),
    };

    if (token) chargeParams.card = token;
    if (card) chargeParams.card = card;
    if (customerId) chargeParams.customerId = customerId;

    return chargeParams;
};

// ========================================

export default router;