import assert from "node:assert/strict";
import test from "node:test";
import { Expo } from "expo-server-sdk";
import type { ExpoPushMessage, ExpoPushReceipt, ExpoPushReceiptId, ExpoPushTicket } from "expo-server-sdk";
import { kdsNotificationRegistrationSchema } from "../src/database/schemas";
import type { Db } from "../src/database/db";
import { GET } from "../src/queries/GET";
import { PATCH } from "../src/queries/PATCH";
import { POST } from "../src/queries/POST";
import type { KdsNotificationClient } from "../src/notifications/kdsNotification";

process.env.SUPABASE_DB_URL ??= "postgresql://postgres:postgres@localhost:5432/test";
process.env.STRIPE_SECRET_TEST_KEY ??= "test-stripe-key";
process.env.RESEND_API_KEY ??= "test-resend-key";

const notificationService = import("../src/notifications/kdsNotification");
const tokenA = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";
const tokenB = "ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]";

type QueryCall = { query: string; params: readonly unknown[] };

const makeDb = (registrations: { id: string; expo_push_token: string }[] = []) => {
    const calls: QueryCall[] = [];
    const db = {
        unsafe: async <T extends object>(query: string, params: readonly unknown[] = []): Promise<T[]> => {
            calls.push({ query, params });
            return (query === GET.ACTIVE_KDS_NOTIFICATIONS ? registrations : []) as T[];
        },
    } as unknown as Db;

    return { db, calls };
};

const makeExpoClient = (
    sent: ExpoPushMessage[],
    send: (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]> = async messages =>
        messages.map((_, index) => ({ status: "ok", id: `receipt-${index}` }))
): KdsNotificationClient => ({
    chunkPushNotifications: messages => [messages],
    chunkPushNotificationReceiptIds: receiptIds => [receiptIds],
    sendPushNotificationsAsync: async messages => {
        sent.push(...messages);
        return send(messages);
    },
    getPushNotificationReceiptsAsync: async (): Promise<Record<string, ExpoPushReceipt>> => ({}),
});

test("KDS registration validates Android device payload and Expo token format", () => {
    assert.deepEqual(
        kdsNotificationRegistrationSchema.parse({
            branchKey: "branch-key",
            deviceId: "android-device",
            expoPushToken: tokenA,
            platform: "android",
        }),
        {
            branchKey: "branch-key",
            deviceId: "android-device",
            expoPushToken: tokenA,
            platform: "android",
        }
    );
    assert.throws(() =>
        kdsNotificationRegistrationSchema.parse({
            branchKey: "branch-key",
            deviceId: "android-device",
            expoPushToken: tokenA,
            platform: "ios",
        })
    );
    assert.equal(Expo.isExpoPushToken(tokenA), true);
    assert.equal(Expo.isExpoPushToken("not-an-expo-token"), false);
    assert.match(GET.ACTIVE_BRANCH_BY_KEY, /branch_key = \$1 AND active = TRUE/);
    assert.match(POST.KDS_NOTIFICATION, /ON CONFLICT \(branch_id, device_id\)/);
    assert.match(POST.KDS_NOTIFICATION, /expo_push_token = EXCLUDED\.expo_push_token/);
    assert.match(POST.KDS_NOTIFICATION, /active = TRUE/);
});

test("new order sends one branch-scoped push to every active valid tablet", async () => {
    const { dispatchKdsNewOrderNotification } = await notificationService;
    const { db, calls } = makeDb([
        { id: "device-a", expo_push_token: tokenA },
        { id: "device-b", expo_push_token: tokenB },
        { id: "invalid-device", expo_push_token: "invalid" },
    ]);
    const sent: ExpoPushMessage[] = [];
    const client = makeExpoClient(sent);

    await dispatchKdsNewOrderNotification(db, client, {
        id: "order-1",
        branch_id: "walsall",
        order_number: 42,
    });

    assert.equal(calls[0]?.query, GET.ACTIVE_KDS_NOTIFICATIONS);
    assert.deepEqual(calls[0]?.params, ["walsall"]);
    assert.match(calls[0]?.query ?? "", /WHERE branch_id = \$1 AND active = TRUE/);
    assert.equal(sent.length, 2);
    assert.deepEqual(
        sent.map(message => message.to),
        [tokenA, tokenB]
    );
    for (const message of sent) {
        assert.equal(message.title, "NEW ORDER RECEIVED");
        assert.equal(message.channelId, "default");
        assert.deepEqual(message.data, {
            event: "NEW_ORDER",
            order_id: "order-1",
            branch_id: "walsall",
        });
    }
});

test("DeviceNotRegistered receipts deactivate only their associated device", async () => {
    const { processKdsPushReceipts } = await notificationService;
    const { db, calls } = makeDb();
    const sent: ExpoPushMessage[] = [];
    const client = makeExpoClient(sent);
    client.getPushNotificationReceiptsAsync = async (receiptIds: ExpoPushReceiptId[]) => ({
        [receiptIds[0] ?? ""]: {
            status: "error",
            message: "Device not registered",
            details: { error: "DeviceNotRegistered" },
        },
    });

    await processKdsPushReceipts(
        db,
        client,
        "walsall",
        new Map([["receipt-1", "device-a"]])
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.query, PATCH.KDS_NOTIFICATION_DEACTIVATE);
    assert.deepEqual(calls[0]?.params, ["device-a"]);
});

test("Expo send failures do not reject the already-created order flow", async () => {
    const { dispatchKdsNewOrderNotification } = await notificationService;
    const { db } = makeDb([{ id: "device-a", expo_push_token: tokenA }]);
    const client = makeExpoClient([], async () => {
        throw new Error("push service unavailable");
    });

    await assert.doesNotReject(
        dispatchKdsNewOrderNotification(db, client, {
            id: "order-2",
            branch_id: "walsall",
            order_number: 43,
        })
    );
});
