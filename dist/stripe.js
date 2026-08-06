"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeClient = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const stripe_1 = __importDefault(require("stripe"));
dotenv_1.default.config();
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
    throw new Error("Missing Stripe secret key. Set STRIPE_SECRET_KEY.");
}
exports.stripeClient = new stripe_1.default(secretKey);
