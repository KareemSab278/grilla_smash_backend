import express from "express";
import { shift4Client } from "./shift4";

const router = express.Router();

const normalizeCurrency = (currency?: string) => (currency || "GBP").toUpperCase();

const normalizeAmount = (amount: string | number | undefined) => {
    if (amount === undefined || amount === null || amount === "") {
        throw new Error("Invalid amount");
    }

    if (typeof amount === "number") {
        if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error("Invalid amount");
        }
        return Math.round(amount);
    }

    const parsed = String(amount).trim();
    if (!parsed) {
        throw new Error("Invalid amount");
    }

    if (parsed.includes(".")) {
        const [whole, fraction = ""] = parsed.split(".");
        const normalizedFraction = (fraction + "00").slice(0, 2);
        const minorUnitAmount = Number(`${whole}${normalizedFraction}`);

        if (!Number.isFinite(minorUnitAmount) || minorUnitAmount <= 0) {
            throw new Error("Invalid amount");
        }

        return minorUnitAmount;
    }

    const minorUnitAmount = Number(parsed);
    if (!Number.isFinite(minorUnitAmount) || minorUnitAmount <= 0) {
        throw new Error("Invalid amount");
    }

    return minorUnitAmount;
};

export const buildCheckoutRequest = ({
    amount,
    currency = "GBP",
}: {
    amount: string | number;
    currency?: string;
}) => {
    const charge: Record<string, any> = {
        amount: normalizeAmount(amount),
        currency: normalizeCurrency(currency),
    };
    return { charge };
};

const buildChargeParams = ({ amount, currency, token, card, customerId }: Record<string, any>) => {
    const chargeParams: Record<string, any> = {
        amount: normalizeAmount(amount),
        currency: normalizeCurrency(currency),
    };

    if (token) chargeParams.card = token;
    if (card) chargeParams.card = card;
    if (customerId) chargeParams.customerId = customerId;

    return chargeParams;
};

router.post("/charge", async (req, res) => {
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

        return res.json({
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Unable to create charge.",
            error_message: (err as Error).message,
        });
    }
});

router.get("/checkout-session", (req, res) => {
    try {
        const { amount, currency = "gbp" } = req.query as Record<string, any>;
        const request = buildCheckoutRequest({ amount, currency });

        const clientSecret = shift4Client.checkoutRequest.sign(request);

        return res.json({ success: true, clientSecret });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Unable to create checkout session.",
            error_message: (err as Error).message,
        });
    }
});

router.post("/checkout-callback", async (req, res) => {
    try {
        const body = req.body ?? {};
        const shift4ChargeId = body.shift4ChargeId || body.chargeId || body.id || body.charge?.id;

        if (!shift4ChargeId) {
            return res.status(400).json({ success: false, error: "Missing shift4ChargeId" });
        }

        const charge = await shift4Client.charges.get(shift4ChargeId);

        return res.json({
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Unable to verify charge.",
            error_message: (err as Error).message,
        });
    }
});

export default router;
