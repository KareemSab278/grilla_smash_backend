/*
    REDIS - SHARED DISTRIBUTED STORE FOR CROSS-INSTANCE FEATURES.

    Startup calls connectRedis() before the server listens. If Redis is unavailable, startup fails.
    Shutdown calls closeRedis() so the client disconnects cleanly.
*/

import { createClient, type RedisClientType } from "redis";

const REDIS_ERROR_PREFIX = "[Redis]";

let redisClient: RedisClientType | null = null;

const getRedisUrl = (): string => {
    const value = process.env.REDIS_URL;
    if (!value) throw new Error("REDIS_URL missing");

    return value;
};

export const createRedisClient = (url: string = getRedisUrl()): RedisClientType => {
    const client = createClient({ url });
    client.on("error", (err: unknown) => {
        console.error(`${REDIS_ERROR_PREFIX} client error:`, err);
    });
    console.log(`${REDIS_ERROR_PREFIX} client created successfully!`);
    return client;
};

export const getRedisClient = (): RedisClientType => {
    if (!redisClient) {
        redisClient = createRedisClient();
    }

    return redisClient;
};

let connectPromise: Promise<RedisClientType> | null = null;

export const connectRedis = async (client: RedisClientType = getRedisClient()): Promise<RedisClientType> => {
    if (client.isOpen) return client;

    if (!connectPromise) {
        connectPromise = client
            .connect()
            .then(async () => {
                await client.ping();
                return client;
            })
            .finally(() => {
                connectPromise = null;
            });
    }

    return await connectPromise;
};

export const closeRedis = async (client: RedisClientType = getRedisClient()): Promise<void> => {
    if (!client.isOpen) return;

    await client.quit();
};
