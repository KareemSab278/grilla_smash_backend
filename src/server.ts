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
import { CONFIG } from "./config";
import { closeDb } from "./db";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { rateLimiterMiddleware } from "./middleware/rateLimiter";

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
app.use(rateLimiterMiddleware);
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

const server = app.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`Server running on http://${CONFIG.host}:${CONFIG.port}`);
});

// stop accepting requests, let in-flight ones finish, then close the connection pool
const shutdown = (signal: string): void => {
    console.log(`${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
        console.error("Shutdown timed out, forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(() => {
        closeDb()
            .then(() => process.exit(0))
            .catch((err: unknown) => {
                console.error("Failed to close database cleanly:", err);
                process.exit(1);
            });
    });
    server.closeIdleConnections();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
