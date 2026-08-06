"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shift4_1 = require("../shift4");
const stripe_1 = require("../stripe");
const helpers_1 = require("../helpers");
const router = express_1.default.Router();
router.post("/payments/charge", async (req, res) => await handleCharge(req, res));
router.get("/payments/checkout-session", async (req, res) => await getCheckoutSession(req, res));
router.post("/payments/checkout-callback", async (req, res) => await getCheckoutCallback(req, res));
router.post("/payments/stripe/charge", async (req, res) => await handleStripeCharge(req, res));
router.get("/payments/stripe/checkout-session", async (req, res) => await getStripeCheckoutSession(req, res));
router.get("/payments/stripe-checkout-session", async (req, res) => await getStripeCheckoutSession(req, res));
router.post("/payments/stripe/checkout-callback", async (req, res) => await getStripeCheckoutCallback(req, res));
// ========================================
const errorResponse = (res, error, errorMessage) => {
    return res.status(500).json({
        success: false,
        error,
        error_message: errorMessage,
    });
};
// ========================================
const getCheckoutCallback = async (req, res) => {
    try {
        const body = req.body ?? {};
        const shift4ChargeId = body.shift4ChargeId || body.chargeId || body.id || body.charge?.id;
        if (!shift4ChargeId) {
            return res.status(400).json({ success: false, error: "Missing shift4ChargeId" });
        }
        const charge = await shift4_1.shift4Client.charges.get(shift4ChargeId);
        const response = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };
        return res.json(response);
    }
    catch (err) {
        return errorResponse(res, "Unable to verify charge.", err.message);
    }
};
// ========================================
const getCheckoutSession = async (req, res) => {
    try {
        const { amount, currency = "GBP" } = req.query;
        const request = (0, helpers_1.buildCheckoutRequest)({ amount, currency });
        const clientSecret = shift4_1.shift4Client.checkoutRequest.sign(request);
        return res.json({ success: true, clientSecret });
    }
    catch (err) {
        return errorResponse(res, "Unable to create checkout session.", err.message);
    }
};
// ========================================
const handleCharge = async (req, res) => {
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
        const charge = await shift4_1.shift4Client.charges.create(chargeParams);
        const response = {
            success: true,
            charge_id: charge.id,
            amount: charge.amount,
            currency: charge.currency,
            status: charge.status,
        };
        return res.json(response);
    }
    catch (err) {
        errorResponse(res, "Unable to create charge.", err.message);
    }
};
// ========================================
const buildChargeParams = ({ amount, currency, token, card, customerId }) => {
    const chargeParams = {
        amount: (0, helpers_1.normalizeAmount)(amount),
        currency: currency.toUpperCase(),
    };
    if (token)
        chargeParams.card = token;
    if (card)
        chargeParams.card = card;
    if (customerId)
        chargeParams.customerId = customerId;
    return chargeParams;
};
// ========================================
const getStripeCheckoutCallback = async (req, res) => {
    try {
        const body = req.body ?? {};
        const stripeSessionId = body.stripeSessionId || body.sessionId || body.id;
        if (!stripeSessionId) {
            return res.status(400).json({ success: false, error: "Missing stripeSessionId" });
        }
        const session = await stripe_1.stripeClient.checkout.sessions.retrieve(stripeSessionId);
        const response = {
            success: true,
            charge_id: session.id,
            amount: session.amount_total ?? undefined,
            currency: session.currency ?? undefined,
            status: session.payment_status === "paid" ? 200 : 402,
        };
        return res.json(response);
    }
    catch (err) {
        return errorResponse(res, "Unable to verify Stripe session.", err.message);
    }
};
// ========================================
const getStripeCheckoutSession = async (req, res) => {
    try {
        const { amount, currency = "GBP" } = req.query;
        const normalizedAmount = (0, helpers_1.normalizeAmount)(amount);
        const paymentIntent = await stripe_1.stripeClient.paymentIntents.create({
            amount: normalizedAmount,
            currency: currency.toUpperCase(),
            automatic_payment_methods: { enabled: true },
        });
        return res.json({ success: true, clientSecret: paymentIntent.client_secret });
    }
    catch (err) {
        return errorResponse(res, "Unable to create Stripe checkout session.", err.message);
    }
};
// ========================================
const handleStripeCharge = async (req, res) => {
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
        const paymentIntent = await stripe_1.stripeClient.paymentIntents.create({
            amount: (0, helpers_1.normalizeAmount)(amount),
            currency: currency.toUpperCase(),
            payment_method: paymentMethodId,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        });
        const response = {
            success: true,
            charge_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status === "succeeded" ? 200 : 402,
        };
        return res.json(response);
    }
    catch (err) {
        return errorResponse(res, "Unable to create Stripe charge.", err.message);
    }
};
// ========================================
exports.default = router;
