/*
    PAYMENT PROVIDER CLIENTS - STRIPE IS THE MAIN PROVIDER, SHIFT4 IS A FALLBACK.

    Keys come from config.ts. Shift4 is optional: without SHIFT4_SECRET_KEY there is no client and
    requireShift4() throws a 503, so only the shift4 routes are affected.
*/

import Stripe from "stripe";
import { CONFIG } from "../config";
import { HttpError } from "../helpers/errors";

// the shift4 package ships no type definitions
const createShift4 = require("shift4") as (secretKey: string) => any;

const shift4 = CONFIG.shift4SecretKey ? createShift4(CONFIG.shift4SecretKey) : undefined;

export const stripe = new Stripe(CONFIG.stripeSecretKey);

export const requireShift4 = () => {
    if (!shift4) throw new HttpError(503, "Shift4 is not configured");
    return shift4;
};
