import dotenv from "dotenv";
import Stripe from "stripe";
dotenv.config();

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
    throw new Error("Missing Stripe secret key. Set STRIPE_SECRET_KEY.");
}

export const stripeClient = new Stripe(secretKey);
