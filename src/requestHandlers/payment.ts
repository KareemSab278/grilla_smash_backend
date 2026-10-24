/*
    PAYMENT ROUTES - STRIPE (MAIN) AND SHIFT4 (FALLBACK).

    Every failure leaves as { success: false, error, error_message? } with a 500, except a provider that is
    not configured (503) and bad input (400). Amounts go through normalizeAmount() into minor units (pence).
*/

import express from "express";
import type { Request, Response } from "express";
import { CONFIG } from "../config";
import { stripe, requireShift4 } from "../payment/payProviders";
import { REFUND } from "../payment/stripeRefunding";
import { badRequest, conflict, HttpError } from "../helpers/errors";
import { normalizeAmount, buildCheckoutRequest, getRequiredRow, orNull, requireRow } from "../helpers/helpers";
import { QUERIES } from "../queries/queries";
import sql, { dbGet } from "../database/db";
import { notifyOrderRefund } from "../notifications/orderEmails";
import type { OrderRow } from "../types";
import { requireBranchManager } from "../middleware/requireBranchManager";
import { parseInput } from "../middleware/validate";
import { refundFullSchema, refundPartialSchema } from "../database/schemas";

const router = express.Router();
router.post("/refund/full", async (req, res) => await fullRefund(req, res));
router.post("/refund/partial", async (req, res) => await partialRefund(req, res));
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

const stripeLog = (event: string, details: Record<string, unknown>): void => {
    if (process.env.NODE_ENV !== "development") return;
    console.info(`[stripe] ${event}`, details);
};

const stripeErrorDetails = (err: unknown): Record<string, unknown> => {
    const details: Record<string, unknown> = {
        message: err instanceof Error ? err.message : String(err),
    };
    if (err instanceof Error) details.name = err.name;

    if (err !== null && typeof err === "object") {
        const metadata = err as Record<string, unknown>;
        for (const key of ["type", "code", "statusCode", "requestId"] as const) {
            const value = metadata[key];
            if (typeof value === "string" || typeof value === "number") details[key] = value;
        }
    }

    return details;
};

type RefundResponse = {
    success: true;
    refund_id: string;
    amount: number;
    currency: string;
    status: string | null;
    order_status: string;
};

const formatPounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

// "PREPARING - refund £5.00" -> "PREPARING", so a second partial refund does not stack suffixes
const baseStatus = (status: string): string => status.replace(/ - refund £.*$/, "");

// issues the Stripe refund, then records it on the order and emails the customer
const refundOrder = async (
    orderId: string,
    reason: string | null | undefined,
    amount: number | undefined
): Promise<RefundResponse> => {
    const order = await getRequiredRow<OrderRow>(sql, QUERIES.GET.ORDER_BY_ID, orderId, "order");

    if (!order.payment_reference) throw badRequest("Order has no payment reference to refund");
    if (order.status === "REFUNDED") throw conflict("Order is already fully refunded");

    const partial = amount !== undefined;
    const refund = partial
        ? await REFUND.partial(order.payment_reference, amount)
        : await REFUND.full(order.payment_reference);

    const newStatus = partial ? `${baseStatus(order.status)} - refund ${formatPounds(refund.amount)}` : "REFUNDED";
    const updated = requireRow(
        await dbGet<{ id: string; status: string }>(sql, QUERIES.PATCH.ORDER_REFUND, [order.id, newStatus, orNull(reason)]),
        "order"
    );

    notifyOrderRefund({ orderId: order.id, amount: refund.amount, partial, reason: reason ?? null });

    return {
        success: true,
        refund_id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status ?? null,
        order_status: updated.status,
    };
};

const fullRefund = async (req: Request, res: Response<RefundResponse | ErrorResponse>) => {
    await requireBranchManager(req);
    const { order_id, reason } = parseInput(refundFullSchema, req.body);

    try {
        return res.json(await refundOrder(order_id, reason, undefined));
    } catch (err) {
        stripeLog("refund.full.failed", stripeErrorDetails(err));
        return errorResponse(res, "Unable to issue full refund.", err);
    }
};

const partialRefund = async (req: Request, res: Response<RefundResponse | ErrorResponse>) => {
    await requireBranchManager(req);
    const { order_id, reason, amount } = parseInput(refundPartialSchema, req.body);

    try {
        return res.json(await refundOrder(order_id, reason, amount));
    } catch (err) {
        stripeLog("refund.partial.failed", stripeErrorDetails(err));
        return errorResponse(res, "Unable to issue partial refund.", err);
    }
};

// ========================================

const getCheckoutCallback = async (req: Request, res: Response) => {
    return CONFIG.useStripe
        ? getStripeCheckoutCallback(req, res)
        : getShift4CheckoutCallback(req, res);
};

const getShift4CheckoutCallback = async (req: Request, res: Response) => {
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

// handles both stripe and shift4 depending on USE_STRIPE
const getCheckoutSession = async (req: Request, res: Response) => {
    try {
        return CONFIG.useStripe
            ? await getStripeCheckoutSession(req, res)
            : await getShift4CheckoutSession(req, res);
    } catch (err) {
        return errorResponse(res, "Unable to create checkout session.", err);
    }
};

const getShift4CheckoutSession = async (req: Request, res: Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const request = buildCheckoutRequest({ amount, currency });

        const clientSecret = requireShift4().checkoutRequest.sign(request);

        return res.json({ success: true, clientSecret });
    } catch (err) {
        return errorResponse(res, "Unable to create checkout session.", err);
    }
};


const getStripeCheckoutSession = async (req: Request, res: Response) => {
    try {
        const { amount, currency = "GBP" } = req.query as Record<string, any>;
        const normalizedAmount = normalizeAmount(amount);

        stripeLog("payment_intent.create.started", {
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
        });
        const paymentIntent = await stripe.paymentIntents.create({
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
            automatic_payment_methods: { enabled: true },
        });

        stripeLog("payment_intent.create.succeeded", {
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            hasClientSecret: Boolean(paymentIntent.client_secret),
        });
        return res.json({ success: true, clientSecret: paymentIntent.client_secret });
    } catch (err) {
        stripeLog("payment_intent.create.failed", stripeErrorDetails(err));
        return errorResponse(res, "Unable to create Stripe checkout session.", err);
    }
};


// ========================================

const handleCharge = async (req: Request, res: Response) => {
    return CONFIG.useStripe
        ? handleStripeCharge(req, res)
        : handleShift4Charge(req, res);
};

const handleShift4Charge = async (req: Request, res: Response) => {
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
        const sessionId = body.stripeSessionId || body.sessionId;
        const paymentIntentId =
            body.paymentIntentId || body.stripePaymentIntentId || body.paymentId ||
            (typeof body.id === "string" && body.id.startsWith("pi_") ? body.id : undefined);

        if (sessionId || (typeof body.id === "string" && body.id.startsWith("cs_"))) {
            const requestedSessionId = sessionId || body.id;
            stripeLog("checkout_session.retrieve.started", { sessionId: requestedSessionId });
            const session = await stripe.checkout.sessions.retrieve(requestedSessionId);
            const response: healthyResponse = {
                success: true,
                charge_id: session.id,
                amount: session.amount_total ?? undefined,
                currency: session.currency ?? undefined,
                status: session.payment_status === "paid" ? 200 : 402,
            };

            stripeLog("checkout_session.retrieve.succeeded", {
                sessionId: session.id,
                paymentStatus: session.payment_status,
                status: response.status,
            });
            return res.json(response);
        }

        if (!paymentIntentId) {
            stripeLog("callback.invalid_request", {
                hasSessionId: Boolean(sessionId),
                hasPaymentIntentId: Boolean(paymentIntentId),
            });
            return res.status(400).json({ success: false, error: "Missing paymentIntentId or stripeSessionId" });
        }

        stripeLog("payment_intent.retrieve.started", { paymentIntentId });
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        const response: healthyResponse = {
            success: true,
            charge_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status === "succeeded" ? 200 : 402,
        };

        stripeLog("payment_intent.retrieve.succeeded", {
            paymentIntentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
            status: response.status,
        });
        return res.json(response);
    } catch (err) {
        stripeLog("callback.failed", stripeErrorDetails(err));
        return errorResponse(res, "Unable to verify Stripe session.", err);
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

        const normalizedAmount = normalizeAmount(amount);
        stripeLog("payment_intent.charge.started", {
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
            hasPaymentMethodId: true,
        });
        const paymentIntent = await stripe.paymentIntents.create({
            amount: normalizedAmount,
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

        stripeLog("payment_intent.charge.succeeded", {
            paymentIntentId: paymentIntent.id,
            paymentStatus: paymentIntent.status,
            status: response.status,
        });
        return res.json(response);
    } catch (err) {
        stripeLog("payment_intent.charge.failed", stripeErrorDetails(err));
        return errorResponse(res, "Unable to create Stripe charge.", err);
    }
};

// ========================================

export default router;