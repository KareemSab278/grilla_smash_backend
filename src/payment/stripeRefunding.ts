import Stripe from "stripe";
import { CONFIG } from "../config";

const STRIPE_SECRET_KEY = CONFIG.stripeSecretKey;

if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is missing from configuration.");
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const REFUND = {
    // Refund the remaining refundable amount.
    full: async (paymentRef: string) => {
        if (!paymentRef) {
            throw new Error("Payment reference is required.");
        }

        return await stripe.refunds.create({
            payment_intent: paymentRef,
        });
    },

    // Amount must be in the smallest currency unit.
    // For GBP: £5.00 = 500 pence.
    partial: async (paymentRef: string, amount: number) => {
        if (!paymentRef) {
            throw new Error("Payment reference is required.");
        }

        if (!Number.isInteger(amount) || amount <= 0) {
            throw new Error(
                "Refund amount must be a positive integer in pence."
            );
        }

        return await stripe.refunds.create({
            payment_intent: paymentRef,
            amount,
        });
    },
};