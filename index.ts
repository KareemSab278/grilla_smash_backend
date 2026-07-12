import express from "express";
import { stripe } from "./stripe";

const router = express.Router();


// interface reqBody {
//     endpoint: string;
//     body: {
//         amount: number;
//         currency: string;
//     };
// }

router.post("/create-intent", async (req, res) => {
    try {
        const { amount, currency } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: "Invalid amount",
            });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount,
            currency,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        return res.json({
            success: true,
            client_secret: paymentIntent.client_secret,
            payment_intent_id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
        });
    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            error: "Unable to create payment intent.",
        });
    }
});

export default router;