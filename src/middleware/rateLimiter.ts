/*
    RATE LIMITER - ONE SHARED IN-PROCESS BUDGET FOR EVERY CLIENT (NOT PER IP).

    - 30 requests per second
    - 100 requests per minute
    Exceeding either limit blocks every request in this process for 60 seconds.
*/

import type { RequestHandler } from "express";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";

const MAX_REQUESTS_PER_SECOND = 30;
const MAX_REQUESTS_PER_MINUTE = 100;
const BLOCK_DURATION_MS = 60_000;
const SHARED_KEY = "all-requests";

type RateLimiterLike = Pick<RateLimiterMemory, "consume">;

export type RateLimiterDeps = {
    perSecondLimiter: RateLimiterLike;
    perMinuteLimiter: RateLimiterLike;
    getNow: () => number;
    getBlockedUntil: () => number;
    setBlockedUntil: (timestamp: number) => void;
};

let blockedUntil = 0;

const perSecondLimiter = new RateLimiterMemory({
    points: MAX_REQUESTS_PER_SECOND,
    duration: 1,
});

const perMinuteLimiter = new RateLimiterMemory({
    points: MAX_REQUESTS_PER_MINUTE,
    duration: 60,
});

const defaultDeps: RateLimiterDeps = {
    perSecondLimiter,
    perMinuteLimiter,
    getNow: Date.now,
    getBlockedUntil: () => blockedUntil,
    setBlockedUntil: timestamp => {
        blockedUntil = timestamp;
    },
};

const isRateLimiterRes = (value: unknown): value is RateLimiterRes => value instanceof RateLimiterRes;

const activateGlobalBlock = (dependencies: RateLimiterDeps): number => {
    const expiry = Math.max(dependencies.getBlockedUntil(), dependencies.getNow() + BLOCK_DURATION_MS);
    dependencies.setBlockedUntil(expiry);
    return Math.max(1, Math.ceil((expiry - dependencies.getNow()) / 1000));
};

export const createRateLimiterMiddleware = (dependencies: RateLimiterDeps = defaultDeps): RequestHandler => {
    return async (_req, res, next) => {
        const remainingBlockMs = dependencies.getBlockedUntil() - dependencies.getNow();
        if (remainingBlockMs > 0) {
            res.set("Retry-After", String(Math.ceil(remainingBlockMs / 1000)));
            res.status(429).json({ detail: "Too many requests - Please wait " + Math.ceil(remainingBlockMs / 1000) + " seconds" });
            return;
        }

        try {
            await dependencies.perSecondLimiter.consume(SHARED_KEY);
        } catch (err: unknown) {
            if (!isRateLimiterRes(err)) {
                next(err);
                return;
            }

            res.set("Retry-After", String(activateGlobalBlock(dependencies)));
            res.status(429).json({ detail: "Too many requests - Please wait " + String(activateGlobalBlock(dependencies)) + " seconds" });
            return;
        }

        try {
            await dependencies.perMinuteLimiter.consume(SHARED_KEY);
        } catch (err: unknown) {
            if (!isRateLimiterRes(err)) {
                next(err);
                return;
            }

            res.set("Retry-After", String(activateGlobalBlock(dependencies)));
            res.status(429).json({ detail: "Too many requests - Please wait " + String(activateGlobalBlock(dependencies)) + " seconds" });
            return;
        }

        next();
    };
};

export const rateLimiterMiddleware = createRateLimiterMiddleware();
