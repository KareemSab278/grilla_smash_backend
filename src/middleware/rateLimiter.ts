/*
    RATE LIMITER - ONE SHARED BUDGET FOR EVERY CLIENT COMBINED (NOT PER IP).

    Every request checks a Redis-backed global block state first.
    If not blocked, the shared request budget is consumed from Redis-backed limiters:
    - 5 requests per second
    - 300 requests per minute
    Exceeding either limit sets the same 60-second global block key in Redis.
*/

import type { RequestHandler } from "express";
import { RateLimiterRedis, RateLimiterRes } from "rate-limiter-flexible";
import type { RedisClientType } from "redis";

const MAX_REQUESTS_PER_SECOND = 5;
const MAX_REQUESTS_PER_MINUTE = 300;
const BLOCK_DURATION_SECONDS = 60;

const SHARED_KEY = "all-requests";
const BLOCK_KEY = "rate-limit:block:global";
const SECOND_PREFIX = "rate-limit:second:";
const MINUTE_PREFIX = "rate-limit:minute:";

type RedisLike = Pick<RedisClientType, "ttl" | "set">;
type RateLimiterLike = Pick<RateLimiterRedis, "consume">;

export type RateLimiterDeps = {
    redis: RedisLike;
    perSecondLimiter: RateLimiterLike;
    perMinuteLimiter: RateLimiterLike;
};

type BlockResult = {
    blocked: true;
    retryAfterSeconds: number;
};

type AllowResult = {
    blocked: false;
};

const isRateLimiterRes = (value: unknown): value is RateLimiterRes => value instanceof RateLimiterRes;

const readGlobalBlock = async (redis: RedisLike): Promise<number | null> => {
    const ttl = await redis.ttl(BLOCK_KEY);
    return ttl > 0 ? ttl : null;
};

const activateGlobalBlock = async (redis: RedisLike): Promise<number> => {
    const existing = await redis.ttl(BLOCK_KEY);
    if (existing > 0) return existing;

    await redis.set(BLOCK_KEY, "1", { EX: BLOCK_DURATION_SECONDS, NX: true });
    return BLOCK_DURATION_SECONDS;
};

const rejectWithBlock = async (redis: RedisLike): Promise<BlockResult> => {
    const retryAfterSeconds = await activateGlobalBlock(redis);
    return { blocked: true, retryAfterSeconds };
};

const evaluateRequest = async (dependencies: RateLimiterDeps): Promise<BlockResult | AllowResult> => {
    const blocked = await readGlobalBlock(dependencies.redis);
    if (blocked !== null) {
        return { blocked: true, retryAfterSeconds: blocked };
    }

    try {
        await dependencies.perSecondLimiter.consume(SHARED_KEY);
    } catch (err: unknown) {
        if (!isRateLimiterRes(err)) throw err;
        return await rejectWithBlock(dependencies.redis);
    }

    try {
        await dependencies.perMinuteLimiter.consume(SHARED_KEY);
    } catch (err: unknown) {
        if (!isRateLimiterRes(err)) throw err;
        return await rejectWithBlock(dependencies.redis);
    }

    return { blocked: false };
};

export const createRateLimiterMiddleware = (dependencies: RateLimiterDeps): RequestHandler => {
    return async (_req, res, next) => {
        try {
            const result = await evaluateRequest(dependencies);
            if (result.blocked) {
                res.set("Retry-After", String(result.retryAfterSeconds));
                res.status(429).json({ detail: "Too many requests" });
                return;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
};

export const createRedisRateLimiterMiddleware = (redis: RedisClientType): RequestHandler => {
    const perSecondLimiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: SECOND_PREFIX,
        points: MAX_REQUESTS_PER_SECOND,
        duration: 1,
    });
    const perMinuteLimiter = new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: MINUTE_PREFIX,
        points: MAX_REQUESTS_PER_MINUTE,
        duration: 60,
    });

    return createRateLimiterMiddleware({ redis, perSecondLimiter, perMinuteLimiter });
};

export const rateLimiterInternals = {
    BLOCK_DURATION_SECONDS,
    BLOCK_KEY,
    MAX_REQUESTS_PER_MINUTE,
    MAX_REQUESTS_PER_SECOND,
    SHARED_KEY,
    SECOND_PREFIX,
    MINUTE_PREFIX,
    readGlobalBlock,
    activateGlobalBlock,
    evaluateRequest,
};
