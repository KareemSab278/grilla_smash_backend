/*
    ERROR MIDDLEWARE - EVERY ERROR LEAVES THE API AS { "detail": "message" }.

    That shape is what Admin/script.js and Frontend/script.js already read.
    HttpError -> its own status, db constraint errors -> 409 / 400 (see db.mapDbError),
    malformed JSON -> 400, anything else -> logged and returned as a generic 500 (details never leak).
*/

import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError, notFound } from "../helpers/errors";
import { mapDbError } from "../database/db";

export const notFoundHandler: RequestHandler = (req, _res, next) => {
    next(notFound(`Cannot ${req.method} ${req.path}`));
};

// every error leaves the api as { detail } - that is the shape Admin/Frontend already read
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
    if (res.headersSent) {
        next(err);
        return;
    }

    const mapped = mapDbError(err);

    if (mapped instanceof HttpError) {
        res.status(mapped.status).json({ detail: mapped.message });
        return;
    }

    if (mapped instanceof SyntaxError && "status" in mapped && mapped.status === 400) {
        res.status(400).json({ detail: "Malformed JSON body" });
        return;
    }

    console.error(mapped);
    res.status(500).json({ detail: "Internal server error" });
};
