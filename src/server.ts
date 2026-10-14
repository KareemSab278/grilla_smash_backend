/*
    ENTRY POINT - BUILDS THE EXPRESS APP AND STARTS LISTENING.

    Middleware order matters: cors -> rate limiter -> json body parser -> routers -> notFoundHandler -> errorHandler.
    (the limiter sits after cors so a 429 still carries the CORS headers the browser needs to read it)
    Every router is mounted at the root (no /api prefix) because Admin and Frontend call these paths directly.
    On SIGINT / SIGTERM it stops accepting requests, lets in-flight ones finish, then closes the db pool
    (forced exit after SHUTDOWN_TIMEOUT_MS so a stuck connection can never hang a deploy).
*/

import express from "express";
import cors from "cors";
import type { RequestHandler } from "express";
import { CONFIG } from "./config";
import { closeDb } from "./db";
import { closeRedis, connectRedis, getRedisClient } from "./redis";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { createRedisRateLimiterMiddleware } from "./middleware/rateLimiter";

import health from "./requestHandlers/health";
import business from "./requestHandlers/business";
import branches from "./requestHandlers/branches";
import branchProducts from "./requestHandlers/branchProducts";
import categories from "./requestHandlers/categories";
import products from "./requestHandlers/products";
import productModifierGroups from "./requestHandlers/productModifierGroups";
import modifierGroups from "./requestHandlers/modifierGroups";
import modifiers from "./requestHandlers/modifiers";
import offers from "./requestHandlers/offers";
import orders from "./requestHandlers/orders";
import payment from "./requestHandlers/payment";
import users from "./requestHandlers/users";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = express();

app.disable("x-powered-by");

app.use(cors({ origin: CONFIG.corsOrigins, credentials: true }));

const registerAppMiddleware = (rateLimiter: RequestHandler): void => {
    app.use(rateLimiter);
    app.use(express.json({ limit: "1mb" }));

    app.use(health);
    app.use(business);
    app.use(branches);
    app.use(branchProducts);
    app.use(categories);
    app.use(products);
    app.use(productModifierGroups);
    app.use(modifierGroups);
    app.use(modifiers);
    app.use(offers);
    app.use(orders);
    app.use(payment);
    app.use(users);

    app.use(notFoundHandler);
    app.use(errorHandler);
};

let server: ReturnType<typeof app.listen> | undefined;

// stop accepting requests, let in-flight ones finish, then close the connection pool
const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
        console.error("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    if (!server) {
        closeRedis()
            .then(() => process.exit(0))
            .catch((err: unknown) => {
                console.error("Failed to close Redis cleanly:", err);
                process.exit(1);
            });
        return;
    }

    server.close(() => {
        Promise.all([closeDb(), closeRedis()])
            .then(() => process.exit(0))
            .catch((err: unknown) => {
                console.error("Failed to close services cleanly:", err);
                process.exit(1);
            });
    });
    server.closeIdleConnections();
};

const main = async (): Promise<void> => {
    const redisClient = getRedisClient();
    await connectRedis(redisClient);
    const rateLimiterMiddleware = createRedisRateLimiterMiddleware(redisClient);

    registerAppMiddleware(rateLimiterMiddleware);
    server = app.listen(CONFIG.port, CONFIG.host, () => {
        console.log(`Server running on http://${CONFIG.host}:${CONFIG.port}`);
    });
};

main().catch((err: unknown) => {
    console.error("Failed to start server:", err);
    process.exit(1);
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
