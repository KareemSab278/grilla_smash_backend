/*
    ORDER EMAILS - TELLS THE CUSTOMER WHEN THEIR ORDER IS CREATED OR ITS STATUS CHANGES.

    Only orders with a customer_email get an email. Sending is fire and forget: a failed email is logged
    and never fails (or delays) the order request that triggered it.
*/

import { QUERIES } from "../queries/queries";
import sql, { dbGet } from "../database/db";
import { sendEmail } from "./email";
import { CONFIG } from "../config";

type OrderStatusUpdates =
    // "PENDING" |
    "ACCEPTED"  |
    "PREPARING" |
    "READY"     |
    // "COMPLETED" |
    "CANCELLED" |
    "REFUNDED";

type OrderEmailContent = {
    subject: string;
    body: string;
};

const ORDER_EMAIL_CONTENT: Partial<Record<OrderStatusUpdates, OrderEmailContent>> = {
    // PENDING: {
    //     subject: "Your order has been received",
    //     body: "has been received and is now being processed. We will notify you when it's ready. Thank you!",
    // },
    ACCEPTED: {
        subject: "Your order has been accepted",
        body: "has been accepted by the store. We will notify you when it's being prepared.",
    },
    PREPARING: {
        subject: "Your order is being prepared",
        body: "is now being prepared. We will notify you when it's ready for pickup or delivery.",
    },
    READY: {
        subject: "Your order is ready",
        body: "is now ready for pickup or delivery.",
    },
    // COMPLETED: {
    //     subject: "Your order is complete",
    //     body: "has been completed. Thank you for choosing us!",
    // },
    CANCELLED: {
        subject: "Your order has been cancelled",
        body: "has been cancelled. If you have any questions, please give our store a call.",
    },
    REFUNDED: {
        subject: "Your order has been refunded",
        body: "has been refunded. You should receive the refund within 5 days. Please check your account for the refund details.",
    },
};

const sendOrderStatusEmail = async (orderId: string, status: OrderStatusUpdates): Promise<void> => {
    const content = ORDER_EMAIL_CONTENT[status];
    if (!content) return;

    const order = await dbGet<{ order_number: number; customer_email: string | null }>(
        sql,
        QUERIES.GET.ORDER_EMAIL_TARGET,
        [orderId]
    );
    if (!order?.customer_email) {
        CONFIG.isDevelopment && console.log(`No customer email for order ${orderId}`);
        return;
    }

    if (CONFIG.isDevelopment) {
        const message = {
            to: order.customer_email,
            subject: content.subject,
            title: content.subject,
            message: `Your order #${order.order_number} ${content.body}`,
        };
        console.log("Development email message:", message);
        await sendEmail(message);
    } else {
        await sendEmail({
            to: order.customer_email,
            subject: content.subject,
            title: content.subject,
            message: `Your order #${order.order_number} ${content.body}`,
        });

    }
};

export const notifyOrderStatus = (orderId: string, status: OrderStatusUpdates): void => {
    sendOrderStatusEmail(orderId, status).catch((err: unknown) => {
        console.error(`Order email failed (order ${orderId}, status ${status}):`, err);
    });
};

const formatPounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

type RefundEmail = {
    orderId: string;
    amount: number;
    partial: boolean;
    reason: string | null;
};

const sendOrderRefundEmail = async ({ orderId, amount, partial, reason }: RefundEmail): Promise<void> => {
    const order = await dbGet<{ order_number: number; customer_email: string | null }>(
        sql,
        QUERIES.GET.ORDER_EMAIL_TARGET,
        [orderId]
    );
    if (!order?.customer_email) {
        CONFIG.isDevelopment && console.log(`No customer email for order ${orderId}, refund email skipped`);
        return;
    }

    const subject = partial ? "Your order has been partially refunded" : "Your order has been refunded";
    const lines = [
        partial
            ? `A partial refund of ${formatPounds(amount)} has been issued for your order #${order.order_number}.`
            : `Your order #${order.order_number} has been fully refunded (${formatPounds(amount)}).`,
    ];
    if (reason) lines.push(`Reason: ${reason}`);
    lines.push("The money should reach your account within 5 working days. If you have any questions, please give our store a call.");

    const message = { to: order.customer_email, subject, title: subject, message: lines.join("\n") };
    if (CONFIG.isDevelopment) console.log("Development refund email message:", message);

    await sendEmail(message);
    CONFIG.isDevelopment && console.log(`Refund email sent (order ${orderId})`);
};

export const notifyOrderRefund = (refund: RefundEmail): void => {
    CONFIG.isDevelopment && console.log(`Refund email queued (order ${refund.orderId})`);
    sendOrderRefundEmail(refund).catch((err: unknown) => {
        console.error(`Refund email failed (order ${refund.orderId}):`, err);
    });
};
