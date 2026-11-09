/*
    RATE LIMITER TESTS - cover the shared in-memory request budget.
*/

import assert from "node:assert/strict";
import test from "node:test";

import { RateLimiterRes } from "rate-limiter-flexible";
import { createRateLimiterMiddleware, type RateLimiterDeps } from "../src/middleware/rateLimiter";

type State = {
    secondCount: number;
    minuteCount: number;
    blockedUntil: number;
    now: number;
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

const invoke = async (middleware: ReturnType<typeof createRateLimiterMiddleware>): Promise<MiddlewareResult> => {
    const { result, res } = createResponse();
    await middleware({} as never, res as never, () => {
        result.nextCalls += 1;
    });

    return result;
};

const createLimiter = (state: State, kind: "second" | "minute", limit: number) => ({
    consume: async () => {
        if (kind === "second") state.secondCount += 1;
        if (kind === "minute") state.minuteCount += 1;

        const value = kind === "second" ? state.secondCount : state.minuteCount;
        if (value > limit) throw new RateLimiterRes(0, 1000, value, false);
    },
});

const createDeps = (state: State, secondLimit = 30, minuteLimit = 100): RateLimiterDeps => ({
    perSecondLimiter: createLimiter(state, "second", secondLimit),
    perMinuteLimiter: createLimiter(state, "minute", minuteLimit),
    getNow: () => state.now,
    getBlockedUntil: () => state.blockedUntil,
    setBlockedUntil: timestamp => {
        state.blockedUntil = timestamp;
    },
    blockDurationMs: 6_000,
});

test("rejects the 31st request within one second and blocks globally", async () => {
    const state: State = { secondCount: 0, minuteCount: 0, blockedUntil: 0, now: 10_000 };
    const middleware = createRateLimiterMiddleware(createDeps(state));

    for (let i = 0; i < 30; i++) {
        const result = await invoke(middleware);
        assert.equal(result.statusCode, null);
        assert.equal(result.nextCalls, 1);
    }

    const blocked = await invoke(middleware);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers.get("retry-after"), "6");
    assert.deepEqual(blocked.body, { detail: "Too many requests - Please wait 6 seconds" });
    assert.equal(state.blockedUntil, state.now + 6_000);
});

test("rejects the 101st request within one minute when per-second is not hit", async () => {
    const state: State = { secondCount: 0, minuteCount: 0, blockedUntil: 0, now: 10_000 };
    const middleware = createRateLimiterMiddleware(createDeps(state, 1000, 100));

    for (let i = 0; i < 100; i++) {
        const result = await invoke(middleware);
        assert.equal(result.statusCode, null);
        assert.equal(result.nextCalls, 1);
    }

    const blocked = await invoke(middleware);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers.get("retry-after"), "6");
    assert.deepEqual(blocked.body, { detail: "Too many requests - Please wait 6 seconds" });
});

test("all middleware instances in this process share the global block state", async () => {
    const state: State = { secondCount: 0, minuteCount: 0, blockedUntil: 0, now: 10_000 };
    const instanceA = createRateLimiterMiddleware(createDeps(state));
    const instanceB = createRateLimiterMiddleware(createDeps(state));

    for (let i = 0; i < 30; i++) await invoke(instanceA);
    assert.equal((await invoke(instanceA)).statusCode, 429);

    const blockedOnOtherInstance = await invoke(instanceB);
    assert.equal(blockedOnOtherInstance.statusCode, 429);
    assert.equal(blockedOnOtherInstance.headers.get("retry-after"), "6");
});

test("Retry-After reports the remaining block duration", async () => {
    const state: State = { secondCount: 0, minuteCount: 0, blockedUntil: 21_500, now: 10_000 };
    const middleware = createRateLimiterMiddleware(createDeps(state));

    const result = await invoke(middleware);
    assert.equal(result.statusCode, 429);
    assert.equal(result.headers.get("retry-after"), "12");
    assert.deepEqual(result.body, { detail: "Too many requests - Please wait 12 seconds" });
});
