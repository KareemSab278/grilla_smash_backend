import express from "express";
import { shift4Client } from "./shift4";

const router = express.Router();

// Called by your pay() function — POST /api/payments/charge
router.post("/charge", async (req, res) => {
    try {
        const { amount, currency, token, card, customerId } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }
        if (!currency) {
            return res.status(400).json({ success: false, error: "Currency is required" });
        }

        const chargeParams: Record<string, any> = { amount, currency };
        if (token) chargeParams.card = token;
        if (card) chargeParams.card = card;
        if (customerId) chargeParams.customerId = customerId;

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

// Generates clientSecret for the Shift4 checkout widget — GET /api/payments/checkout-session
router.get("/checkout-session", (req, res) => {
    try {
        const { amount, currency = "gbp" } = req.query;
        const parsedAmount = parseInt(amount as string, 10);

        if (!parsedAmount || parsedAmount <= 0) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }

        const clientSecret = shift4Client.checkoutRequest.sign({
            charge: {
                amount: parsedAmount,
                currency: currency as string,
            },
        });

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

// Receives shift4ChargeId from the widget form POST — POST /api/payments/checkout-callback
router.post("/checkout-callback", async (req, res) => {
    try {
        const { shift4ChargeId } = req.body;

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