"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCheckoutRequest = exports.normalizeAmount = void 0;
const normalizeAmount = (amount) => {
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
exports.normalizeAmount = normalizeAmount;
const buildCheckoutRequest = ({ amount, currency = "GBP" }) => {
    const charge = {
        amount: (0, exports.normalizeAmount)(amount),
        currency: currency.toUpperCase(),
    };
    return { charge };
};
exports.buildCheckoutRequest = buildCheckoutRequest;
