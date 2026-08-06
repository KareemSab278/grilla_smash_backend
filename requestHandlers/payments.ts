import express from "express";
import { shift4Client } from "../shift4";
import { stripeClient } from "../stripe";
import { normalizeAmount, buildCheckoutRequest } from "../helpers";

const router = express.Router();
router.post("/payments/charge", async (req, res) => await handleCharge(req, res));
router.get("/payments/checkout-session", async (req, res) => await getCheckoutSession(req, res));
router.post("/payments/checkout-callback", async (req, res) => await getCheckoutCallback(req, res));

router.post("/payments/stripe/charge", async (req, res) => await handleStripeCharge(req, res));
router.get("/payments/stripe/checkout-session", async (req, res) => await getStripeCheckoutSession(req, res));
router.get("/payments/stripe-checkout-session", async (req, res) => await getStripeCheckoutSession(req, res));
router.post("/payments/stripe/checkout-callback", async (req, res) => await getStripeCheckoutCallback(req, res));

// ========================================

type healthyResponse = {
    success: boolean;
    charge_id?: string;
    amount?: number;
    currency?: string;
    status?: number;
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

const getStripeCheckoutCallback = async (req: express.Request, res: express.Response) => {
    try {
        const body = req.body ?? {};
        const stripeSessionId = body.stripeSessionId || body.sessionId || body.id;

        if (!stripeSessionId) {
            return res.status(400).json({ success: false, error: "Missing stripeSessionId" });
        }

        const session = await stripeClient.checkout.sessions.retrieve(stripeSessionId);

        const response: healthyResponse = {
            success: true,
            charge_id: session.id,
            amount: session.amount_total ?? undefined,
            currency: session.currency ?? undefined,
            status: session.payment_status === "paid" ? 200 : 402,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to verify Stripe session.", (err as Error).message);
    }
};

// ========================================

const getStripeCheckoutSession = async (req: express.Request, res: express.Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const normalizedAmount = normalizeAmount(amount);

        const paymentIntent = await stripeClient.paymentIntents.create({
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
            automatic_payment_methods: { enabled: true },
        });

        return res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (err) {
        return errorResponse(res, "Unable to create Stripe checkout session.", (err as Error).message);
    }
};

// ========================================

const handleStripeCharge = async (req: express.Request, res: express.Response) => {
    try {
        const { amount, currency, paymentMethodId } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: "Invalid amount" });
        }
        if (!currency) {
            return res.status(400).json({ success: false, error: "Currency is required" });
        }
        if (!paymentMethodId) {
            return res.status(400).json({ success: false, error: "paymentMethodId is required" });
        }

        const paymentIntent = await stripeClient.paymentIntents.create({
            amount: normalizeAmount(amount),
            currency: currency.toUpperCase(),
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        });

        const response: healthyResponse = {
            success: true,
            charge_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status === "succeeded" ? 200 : 402,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to create Stripe charge.", (err as Error).message);
    }
};

// ========================================

export default router;