/*
    ORDER EMAILS - TELLS THE CUSTOMER WHEN THEIR ORDER IS CREATED OR ITS STATUS CHANGES.

    Only orders with a customer_email get an email. Sending is fire and forget: a failed email is logged
    and never fails (or delays) the order request that triggered it.
*/

import { QUERIES } from "../queries/queries";
import sql, { dbGet } from "../database/db";
import { sendEmail } from "./email";
import type { OrderStatus } from "../types";

type OrderEmailContent = {
    subject: string;
    body: string;
};

const ORDER_EMAIL_CONTENT: Partial<Record<OrderStatus, OrderEmailContent>> = {
    PENDING: {
        subject: "Your order has been received",
        body: "has been received and is now being processed. We will notify you when it's ready. Thank you!",
    },
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
    COMPLETED: {
        subject: "Your order is complete",
        body: "has been completed. Thank you for choosing us!",
    },
    CANCELLED: {
        subject: "Your order has been cancelled",
        body: "has been cancelled. If you paid online you will receive a refund within 12 - 24 hours. If you have any questions, please give our store a call.",
    },
    REFUNDED: {
        subject: "Your order has been refunded",
        body: "has been refunded. Please check your account for the refund details.",
    },
};

const sendOrderStatusEmail = async (orderId: string, status: OrderStatus): Promise<void> => {
    const content = ORDER_EMAIL_CONTENT[status];
    if (!content) return;

    const order = await dbGet<{ order_number: number; customer_email: string | null }>(
        sql,
        QUERIES.GET.ORDER_EMAIL_TARGET,
        [orderId]
    );
    if (!order?.customer_email) return;

    await sendEmail({
        to: order.customer_email,
        subject: content.subject,
        title: content.subject,
        message: `Your order #${order.order_number} ${content.body}`,
    });
};

export const notifyOrderStatus = (orderId: string, status: OrderStatus): void => {
    sendOrderStatusEmail(orderId, status).catch((err: unknown) => {
        console.error(`Order email failed (order ${orderId}, status ${status}):`, err);
    });
};
