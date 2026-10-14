/*
    PAYMENT ROUTES - STRIPE (MAIN) AND SHIFT4 (FALLBACK).

    Every failure leaves as { success: false, error, error_message? } with a 500, except a provider that is
    not configured (503) and bad input (400). Amounts go through normalizeAmount() into minor units (pence).
*/

import express from "express";
import type { Request, Response } from "express";
import { stripe, requireShift4 } from "../payProviders";
import { HttpError } from "../errors";
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
    success: false;
    error: string;
    error_message: string;
};

// ========================================

const errorResponse = (res: Response, error: string, err: unknown) => {
    const status = err instanceof HttpError ? err.status : 500;
    const body: ErrorResponse = {
        success: false,
        error,
        error_message: err instanceof Error ? err.message : String(err),
    };

    return res.status(status).json(body);
};

// ========================================

const getCheckoutCallback = async (req: Request, res: Response) => {
    try {
        const body = req.body ?? {};
        const shift4ChargeId = body.shift4ChargeId || body.chargeId || body.id || body.charge?.id;

        if (!shift4ChargeId) {
            return res.status(400).json({ success: false, error: "Missing shift4ChargeId" });
        }

        const charge = await requireShift4().charges.get(shift4ChargeId);

        const response: healthyResponse = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to verify charge.", err);
    }
};

// ========================================

const getCheckoutSession = async (req: Request, res: Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const request = buildCheckoutRequest({ amount, currency });

        const clientSecret = requireShift4().checkoutRequest.sign(request);

        return res.json({ success: true, clientSecret });
    } catch (err) {
        return errorResponse(res, "Unable to create checkout session.", err);
    }
};

// ========================================

const handleCharge = async (req: Request, res: Response) => {
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

        const charge = await requireShift4().charges.create(chargeParams);
        const response: healthyResponse = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to create charge.", err);
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

const getStripeCheckoutCallback = async (req: Request, res: Response) => {
    try {
        const body = req.body ?? {};
        const stripeSessionId = body.stripeSessionId || body.sessionId || body.id;

        if (!stripeSessionId) {
            return res.status(400).json({ success: false, error: "Missing stripeSessionId" });
        }

        const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

        const response: healthyResponse = {
            success: true,
            charge_id: session.id,
            amount: session.amount_total ?? undefined,
            currency: session.currency ?? undefined,
            status: session.payment_status === "paid" ? 200 : 402,
        };

        return res.json(response);
    } catch (err) {
        return errorResponse(res, "Unable to verify Stripe session.", err);
    }
};

// ========================================

const getStripeCheckoutSession = async (req: Request, res: Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const normalizedAmount = normalizeAmount(amount);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
            automatic_payment_methods: { enabled: true },
        });

        return res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (err) {
        return errorResponse(res, "Unable to create Stripe checkout session.", err);
    }
};

// ========================================

const handleStripeCharge = async (req: Request, res: Response) => {
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

        const paymentIntent = await stripe.paymentIntents.create({
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
        return errorResponse(res, "Unable to create Stripe charge.", err);
    }
};

// ========================================

export default router;