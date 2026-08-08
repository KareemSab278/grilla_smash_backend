"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiterMiddleware = void 0;
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const MAX_IP_REQUESTS = 20;
const REQUESTS_DURATION_SECONDS = 1;
const BLOCK_DURATION_SECONDS = 120;
const MAX_REQS_PER_MINUTE = 100;
const rateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: MAX_IP_REQUESTS,
    duration: REQUESTS_DURATION_SECONDS,
    blockDuration: BLOCK_DURATION_SECONDS,
});
const globalRateLimiter = new rate_limiter_flexible_1.RateLimiterMemory({
    points: MAX_REQS_PER_MINUTE,
    duration: 60,
    blockDuration: BLOCK_DURATION_SECONDS,
});
const rateLimiterMiddleware = async (req, res, next) => {
    const key = req.ip || "global";
    try {
        await globalRateLimiter.consume(key);
        await rateLimiter.consume(key);
        next();
    }
    catch (rejRes) {
        if (rejRes instanceof Error) {
            return res.status(500).send("Internal Server Error");
        }
        const retryAfter = Math.ceil((rejRes.msBeforeNext ?? BLOCK_DURATION_SECONDS * 1000) / 1000);
        res.set("Retry-After", String(retryAfter));
        return res.status(429).send("Too Many Requests");
    }
};
exports.rateLimiterMiddleware = rateLimiterMiddleware;
