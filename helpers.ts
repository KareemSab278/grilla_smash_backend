import crypto from "crypto";
import { sendEmail } from "./requestHandlers/email";
import { QUERIES } from "./queries";
import { OrderStatus } from "./types";
import sql from "./db";


export const normalizeAmount = (amount: string | number | undefined) => {
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

export const buildCheckoutRequest = ({ amount, currency = "GBP" }: {
    amount: string | number;
    currency?: string;
}) => {
    const charge: Record<string, any> = {
        amount: normalizeAmount(amount),
        currency: currency.toUpperCase(),
    };
    return { charge };
};


export const keysMatch = (rawKey: string, storedHash: string): boolean => {
    const hashed = Buffer.from(
        crypto.createHash("sha256").update(rawKey).digest("hex")
    );
    const stored = Buffer.from(storedHash);
    if (hashed.length !== stored.length) return false;
    return crypto.timingSafeEqual(hashed, stored);
};

// i will create a fn that has a hmap and generates the email for the customer to receive with required params. so if an order type == 'complete' then send the complete message and ttile email

// this will happen on order updates and creations IF there is a customer email provided in the order. if not then no email will be sent.
export const sendOrderStatusUpdateEmail = async (orderStatus: string, orderId: string) => {

    const [customerEmailRow] = await sql.unsafe<{ customer_email: string }[]>(
        QUERIES.GET.CUSTOMER_EMAIL_BY_ORDER_ID,
        [orderId]
    );

    const customerEmail = customerEmailRow?.customer_email ?? null;

    const updatableStatuses: OrderStatus[] = [
        "received",
        "preparing",
        "ready",
        "delivered",
        "completed",
        "refunded",
        "cancelled"
    ];

    if (!customerEmail || customerEmail.trim() === "" || !customerEmail.includes("@") || customerEmail.length < 7) {
        console.error(`Cannot send email to: ${customerEmail}`);
        return;
    }

    if (!updatableStatuses.includes(orderStatus as OrderStatus)) {
        console.error(`Invalid order status: ${orderStatus}. Cannot send email.`);
        return;
    }

    console.log(`Sending email for order status: ${orderStatus} to customer email: ${customerEmail}`);

    const emailContent = EMAIL_CONTENT_HMAP[orderStatus];
    if (!emailContent) {
        console.error(`No email content found for order status: ${orderStatus}`);
        return;
    }

    await sendEmail({
        to: customerEmail,
        subject: emailContent.subject,
        title: emailContent.subject,
        message: `Your order #${orderId} ${emailContent.body}`,
    });
};

const EMAIL_CONTENT_HMAP: Record<string, { subject: string; body: string }> = {
        received: {
            subject: "Your order has been received",
            body: `has been received and is now being processed. We will notify you when it's ready for pickup or delivery. Thank you!`
        },
        preparing: {
            subject: "Your order is being prepared",
            body: `is now being prepared. We will notify you when it's ready for pickup or delivery.`
        },
        ready: {
            subject: "Your order is ready",
            body: `is now ready for pickup or delivery. Please check your order details for more information.`
        },
        delivered: {
            subject: "Your order has been delivered",
            body: `has been successfully delivered. We hope you enjoy your meal!`
        },
        completed: {
            subject: "Your order is complete",
            body: `has been completed. Thank you for choosing us!`
        },
        refunded: {
            subject: "Your order has been refunded",
            body: `has been refunded. Please check your account for the refund details.`
        },
        cancelled: {
            subject: "Your order has been cancelled",
            body: `has been cancelled. You will receive a refund within the next 12 - 24 hours. If you have any questions, please give our store a call.`
        }
    };