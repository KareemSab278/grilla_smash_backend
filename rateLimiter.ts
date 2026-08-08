import { Request, Response, NextFunction } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";

/*
    MAX 30 REQUESTS PER SECOND PER ALL IPS CURRENTLY MAKING REQUESTS TO THE SERVER
    IF OVER 30 REQS PER SECOND THEN BLOCK EVERYTHING FOR 1 MINUTE - SEND 429 TO EVERYONE
*/
const MAX_GLOBAL_REQUESTS = 30;
const REQUESTS_DURATION_SECONDS = 1;
const BLOCK_DURATION_SECONDS = 60;
const MAX_REQS_PER_MINUTE = 100;

const rateLimiter = new RateLimiterMemory({
    points: MAX_GLOBAL_REQUESTS,
    duration: REQUESTS_DURATION_SECONDS,
    blockDuration: BLOCK_DURATION_SECONDS,
});

const globalRateLimiter = new RateLimiterMemory({
    points: MAX_REQS_PER_MINUTE,
    duration: 60,
    blockDuration: BLOCK_DURATION_SECONDS,
});

export const rateLimiterMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const key = "REQUEST";

    try {
        await globalRateLimiter.consume(key);
        await rateLimiter.consume(key);
        next();
    } catch (rejRes: any) {
        if (rejRes instanceof Error) {
            return res.status(500).send("Internal Server Error");
        }

        const retryAfter = Math.ceil((rejRes.msBeforeNext ?? BLOCK_DURATION_SECONDS * 1000) / 1000);

        res.set("Retry-After", String(retryAfter));
        return res.status(429).send("Too Many Requests");
    }
};