"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.keysMatch = exports.buildCheckoutRequest = exports.normalizeAmount = void 0;
const crypto_1 = __importDefault(require("crypto"));
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
const keysMatch = (rawKey, storedHash) => {
    const hashed = Buffer.from(crypto_1.default.createHash("sha256").update(rawKey).digest("hex"));
    const stored = Buffer.from(storedHash);
    if (hashed.length !== stored.length)
        return false;
    return crypto_1.default.timingSafeEqual(hashed, stored);
};
exports.keysMatch = keysMatch;
