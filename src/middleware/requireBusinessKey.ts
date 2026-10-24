/*
    BUSINESS KEY MIDDLEWARE - GUARDS THE /user ENDPOINTS.

    The caller sends the raw key in the X-Business-Key header. Only a sha256 hash of it is stored
    (business.key_hash) and it is compared in constant time. No business, no key set, or a wrong key all
    give the same 401, so nothing is revealed about which one it was.
*/

import type { RequestHandler } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbGet } from "../database/db";
import { unauthorized } from "../helpers/errors";
import { keysMatch } from "../security/keys";

export const requireBusinessKey: RequestHandler = async (req, _res, next) => {
    const rawKey = req.header("x-business-key");
    if (!rawKey) throw unauthorized("Missing X-Business-Key header");

    const business = await dbGet<{ key_hash: string | null }>(sql, QUERIES.GET.BUSINESS_KEY_HASH);
    if (!business?.key_hash || !keysMatch(rawKey, business.key_hash)) throw unauthorized("Invalid business key");

    next();
};
