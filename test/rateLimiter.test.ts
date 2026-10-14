/*
    RATE LIMITER TESTS - cover the Redis-backed shared budget behavior.
*/

import assert from "node:assert/strict";
import test from "node:test";

import { RateLimiterRes } from "rate-limiter-flexible";
import { createRateLimiterMiddleware, type RateLimiterDeps } from "../src/middleware/rateLimiter";

type SharedState = {
    secondCount: number;
    minuteCount: number;
    blockTtl: number | null;
};

type MiddlewareResult = {
    statusCode: number | null;
    headers: Map<string, string>;
    body: unknown;
    nextCalls: number;
};

const createResponse = () => {
    const result: MiddlewareResult = {
        statusCode: null,
        headers: new Map<string, string>(),
        body: undefined,
        nextCalls: 0,
    };

    const res = {
        status(code: number) {
            result.statusCode = code;
            return res;
        },
        set(name: string, value: string) {
            result.headers.set(name.toLowerCase(), value);
            return res;
        },
        json(payload: unknown) {
            result.body = payload;
            return res;
        },
    };

    return { result, res };
};

const invoke = async (
    middleware: ReturnType<typeof createRateLimiterMiddleware>
): Promise<MiddlewareResult & { res: unknown }> => {
    const { result, res } = createResponse();
    await middleware({} as never, res as never, () => {
        result.nextCalls += 1;
    });

    return { ...result, res };
};

const createSharedRedis = (state: SharedState) => ({
    ttl: async () => (state.blockTtl === null ? -2 : state.blockTtl),
    set: async (_key: string, _value: string, options?: { EX?: number; NX?: boolean }) => {
        if (state.blockTtl !== null && state.blockTtl > 0 && options?.NX) return null;
        state.blockTtl = options?.EX ?? 60;
        return "OK" as const;
    },
});

const createLimiter = (state: SharedState, kind: "second" | "minute", limit: number) => ({
    consume: async () => {
        if (kind === "second") state.secondCount += 1;
        if (kind === "minute") state.minuteCount += 1;

        const value = kind === "second" ? state.secondCount : state.minuteCount;
        if (value > limit) {
            throw new RateLimiterRes(0, 1000, value, false);
        }
    },
});

const createDeps = (state: SharedState, secondLimit: number = 5, minuteLimit: number = 300): RateLimiterDeps => ({
    redis: createSharedRedis(state),
    perSecondLimiter: createLimiter(state, "second", secondLimit),
    perMinuteLimiter: createLimiter(state, "minute", minuteLimit),
});

test("rejects the sixth request within one second", async () => {
    const state: SharedState = { secondCount: 0, minuteCount: 0, blockTtl: null };
    const middleware = createRateLimiterMiddleware(createDeps(state));

    for (let i = 0; i < 5; i++) {
        const result = await invoke(middleware);
        assert.equal(result.statusCode, null);
        assert.equal(result.nextCalls, 1);
    }

    const blocked = await invoke(middleware);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.deepEqual(blocked.body, { detail: "Too many requests" });
    assert.equal(state.blockTtl, 60);
});

test("rejects the 301st request within one minute when per-second is not hit", async () => {
    const state: SharedState = { secondCount: 0, minuteCount: 0, blockTtl: null };
    const middleware = createRateLimiterMiddleware(createDeps(state, 1000, 300));

    for (let i = 0; i < 300; i++) {
        const result = await invoke(middleware);
        assert.equal(result.statusCode, null);
        assert.equal(result.nextCalls, 1);
    }

    const blocked = await invoke(middleware);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers.get("retry-after"), "60");
    assert.deepEqual(blocked.body, { detail: "Too many requests" });
    assert.equal(state.blockTtl, 60);
});

test("shares counters and block state across backend instances", async () => {
    const state: SharedState = { secondCount: 0, minuteCount: 0, blockTtl: null };
    const instanceA = createRateLimiterMiddleware(createDeps(state));
    const instanceB = createRateLimiterMiddleware(createDeps(state));

    const first = await invoke(instanceA);
    assert.equal(first.statusCode, null);
    assert.equal(first.nextCalls, 1);

    const second = await invoke(instanceB);
    assert.equal(second.statusCode, null);
    assert.equal(second.nextCalls, 1);
    assert.equal(state.secondCount, 2);

    for (let i = 0; i < 3; i++) await invoke(instanceA);

    const blocked = await invoke(instanceA);
    assert.equal(blocked.statusCode, 429);
    assert.equal(state.blockTtl, 60);

    const sharedBlock = await invoke(instanceB);
    assert.equal(sharedBlock.statusCode, 429);
    assert.equal(sharedBlock.headers.get("retry-after"), "60");
    assert.equal(state.secondCount, 6);
    assert.equal(state.minuteCount, 5);
});

test("returns the remaining block time in Retry-After", async () => {
    const state: SharedState = { secondCount: 0, minuteCount: 0, blockTtl: 12 };
    const middleware = createRateLimiterMiddleware(createDeps(state));

    const result = await invoke(middleware);
    assert.equal(result.statusCode, 429);
    assert.equal(result.headers.get("retry-after"), "12");
    assert.deepEqual(result.body, { detail: "Too many requests" });
});
