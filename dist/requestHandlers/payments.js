"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shift4_1 = require("../shift4");
const helpers_1 = require("../helpers");
const router = express_1.default.Router();
router.post("/payments/charge", async (req, res) => await handleCharge(req, res));
router.get("/payments/checkout-session", async (req, res) => await getCheckoutSession(req, res));
router.post("/payments/checkout-callback", async (req, res) => await getCheckoutCallback(req, res));
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
exports.default = router;
