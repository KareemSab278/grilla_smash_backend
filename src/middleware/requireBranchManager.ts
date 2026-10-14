/*
    AUTHORIZATION MIDDLEWARE - branch settings are writable only by active ADMIN / MANAGER users.

    Until full Supabase Auth is wired in, the backend accepts a standard Bearer token that is the user id
    from the `users` table. This keeps the branch settings endpoints protected without changing the rest
    of the API surface.
*/

import type { Request } from "express";
import { CONFIG } from "../config";
import { QUERIES } from "../queries";
import sql, { dbGet } from "../db";
import { forbidden, unauthorized } from "../errors";
import type { UserRow } from "../types";

const extractBearerToken = (req: Request): string => {
    const value = req.header("authorization");
    if (!value) throw unauthorized("Missing Authorization header");

    const [scheme, token] = value.split(/\s+/, 2);
    if (scheme !== "Bearer" || !token) throw unauthorized("Invalid Authorization header");

    return token.trim();
};

export const requireBranchManager = async (req: Request): Promise<UserRow> => {
    if (!CONFIG.branchSettingsAuthEnabled) {
        return {
            id: "dev-bypass",
            username: "dev-bypass",
            password_hash: "",
            email: null,
            role: "ADMIN",
            active: true,
            created_at: new Date(),
            updated_at: new Date(),
        };
    }

    const userId = extractBearerToken(req);
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_ID, [userId]);

    if (!user || !user.active) throw unauthorized("Invalid user");
    if (user.role !== "ADMIN" && user.role !== "MANAGER") throw forbidden("Insufficient permissions");

    return user;
};
