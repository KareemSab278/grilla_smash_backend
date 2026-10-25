import { Expo } from "expo-server-sdk";
import type { ExpoPushMessage, ExpoPushReceiptId, ExpoPushTicket } from "expo-server-sdk";
import sql, { dbAll, dbRun } from "../database/db";
import type { Db } from "../database/db";
import { QUERIES } from "../queries/queries";
import { PATCH } from "../queries/PATCH";

const expo = new Expo();
const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;

type KdsRegistration = {
    id: string;
    expo_push_token: string;
};

export type KdsOrderNotification = {
    id: string;
    branch_id: string;
    order_number: number;
};

export type KdsNotificationClient = Pick<
    Expo,
    | "chunkPushNotifications"
    | "chunkPushNotificationReceiptIds"
    | "sendPushNotificationsAsync"
    | "getPushNotificationReceiptsAsync"
>;

const logFailure = (stage: string, branchId: string, error: unknown): void => {
    console.error("[kds-notifications] operation failed", {
        stage,
        branchId,
        errorType: error instanceof Error ? error.name : "UnknownError",
    });
};

const deactivateRegistration = async (db: Db, registrationId: string, branchId: string): Promise<void> => {
    try {
        await dbRun(db, PATCH.KDS_NOTIFICATION_DEACTIVATE, [registrationId]);
    } catch (error) {
        logFailure("deactivate-registration", branchId, error);
    }
};

export const processKdsPushReceipts = async (
    db: Db,
    client: KdsNotificationClient,
    branchId: string,
    registrationByReceiptId: ReadonlyMap<ExpoPushReceiptId, string>
): Promise<void> => {
    const receiptIds = [...registrationByReceiptId.keys()];

    for (const receiptChunk of client.chunkPushNotificationReceiptIds(receiptIds)) {
        try {
            const receipts = await client.getPushNotificationReceiptsAsync(receiptChunk);
            for (const receiptId of receiptChunk) {
                const receipt = receipts[receiptId];
                const registrationId = registrationByReceiptId.get(receiptId);
                if (
                    registrationId &&
                    receipt?.status === "error" &&
                    receipt.details?.error === "DeviceNotRegistered"
                ) {
                    await deactivateRegistration(db, registrationId, branchId);
                } else if (receipt?.status === "error") {
                    console.error("[kds-notifications] Expo receipt reported an error", {
                        branchId,
                        error: receipt.details?.error ?? "ExpoPushError",
                    });
                }
            }
        } catch (error) {
            logFailure("fetch-receipts", branchId, error);
        }
    }
};

const scheduleReceiptCheck = (
    db: Db,
    client: KdsNotificationClient,
    branchId: string,
    registrationByReceiptId: ReadonlyMap<ExpoPushReceiptId, string>
): void => {
    const timer = setTimeout(() => {
        void processKdsPushReceipts(db, client, branchId, registrationByReceiptId);
    }, RECEIPT_CHECK_DELAY_MS);
    timer.unref();
};

const deactivateTicketFailures = async (
    db: Db,
    branchId: string,
    registrations: readonly KdsRegistration[],
    tickets: readonly ExpoPushTicket[]
): Promise<void> => {
    for (const [index, ticket] of tickets.entries()) {
        if (ticket.status === "error") {
            if (ticket.details?.error === "DeviceNotRegistered") {
                const registration = registrations[index];
                if (registration) await deactivateRegistration(db, registration.id, branchId);
            } else {
                console.error("[kds-notifications] Expo ticket reported an error", {
                    branchId,
                    error: ticket.details?.error ?? "ExpoPushError",
                });
            }
        }
    }
};

export const dispatchKdsNewOrderNotification = async (
    db: Db,
    client: KdsNotificationClient,
    order: KdsOrderNotification
): Promise<void> => {
    try {
        const registrations = await dbAll<KdsRegistration>(db, QUERIES.GET.ACTIVE_KDS_NOTIFICATIONS, [
            order.branch_id,
        ]);
        const validRegistrations = registrations.filter(registration => Expo.isExpoPushToken(registration.expo_push_token));
        const invalidCount = registrations.length - validRegistrations.length;
        if (invalidCount > 0) {
            console.error("[kds-notifications] invalid stored Expo token(s) skipped", {
                branchId: order.branch_id,
                count: invalidCount,
            });
        }

        const messages: ExpoPushMessage[] = validRegistrations.map(registration => ({
            to: registration.expo_push_token,
            title: "NEW ORDER RECEIVED",
            body: `Order #${order.order_number} received`,
            data: {
                event: "NEW_ORDER",
                order_id: order.id,
                branch_id: order.branch_id,
            },
            sound: "default",
            channelId: "default",
            priority: "high",
        }));

        const registrationByToken = new Map(
            validRegistrations.map(registration => [registration.expo_push_token, registration])
        );
        const registrationByReceiptId = new Map<ExpoPushReceiptId, string>();
        for (const messageChunk of client.chunkPushNotifications(messages)) {
            const chunkRegistrations = messageChunk
                .map(message => (typeof message.to === "string" ? registrationByToken.get(message.to) : undefined))
                .filter((registration): registration is KdsRegistration => registration !== undefined);

            try {
                const tickets = await client.sendPushNotificationsAsync(messageChunk);
                await deactivateTicketFailures(db, order.branch_id, chunkRegistrations, tickets);
                for (const [index, ticket] of tickets.entries()) {
                    if (ticket.status === "ok") {
                        const registration = chunkRegistrations[index];
                        if (registration) registrationByReceiptId.set(ticket.id, registration.id);
                    }
                }
            } catch (error) {
                logFailure("send-push", order.branch_id, error);
            }
        }

        if (registrationByReceiptId.size > 0) {
            scheduleReceiptCheck(db, client, order.branch_id, registrationByReceiptId);
        }
    } catch (error) {
        logFailure("dispatch", order.branch_id, error);
    }
};

export const notifyKdsOfNewOrder = (order: KdsOrderNotification): void => {
    void dispatchKdsNewOrderNotification(sql, expo, order);
};
