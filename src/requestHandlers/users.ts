/*
    USER ROUTES - ACCOUNT CREATION AND PASSWORD RESET FOR THE ADMIN PANEL.

    RULES:
    Login and password reset do not require the business key.
    Creating new admin/manager accounts still requires the business key as a bootstrap/admin safeguard.
    Users cannot reset their password with their email if the email is not associated with an account.
    Passwords are hashed with scrypt before they are stored and are never returned.
    Reset codes are stored against the user id. Email is only used to look up the account, and email must be unique.

    ROUTES:
    POST /user/login                            sign in a user   { username, password }
    POST /user/admin_creation_code              email a verification code to all active admins { username, email }
    POST /user/new_admin                        create an ADMIN  { username, password, email, verification_code }
    POST /user/new_manager                      create a MANAGER { username, password, email }
    POST /user/reset_password_request           emails a 6 digit code, valid 5 minutes (see passwordResets.ts)
    POST /user/reset_password                   { email, reset_code, new_password } sets the new password
    POST /user/:username/reset_password_request  legacy alias for username-based reset lookup
    POST /user/:username/reset_password          legacy alias for username-based reset lookup
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries/queries";
import sql, { dbAll, dbGet } from "../database/db";
import { sendEmail } from "../notifications/email";
import { badRequest, conflict, unauthorized } from "../helpers/errors";
import { newId, requireRow } from "../helpers/helpers";
import { requireBusinessKey } from "../middleware/requireBusinessKey";
import { parseInput } from "../middleware/validate";
import { consumeResetCode, discardResetCode, issueResetCode, RESET_WINDOW_MS } from "../security/passwordResets";
import {
    ADMIN_CREATION_CODE_WINDOW_MS,
    consumeAdminCreationCode,
    discardAdminCreationCode,
    issueAdminCreationCode,
} from "../security/adminCreationCodes";
import { hashPassword, verifyPassword } from "../security/passwords";
import {
    adminCreateSchema,
    adminCreationCodeRequestSchema,
    userCreateSchema,
    userLoginSchema,
    userPasswordResetLegacySchema,
    userPasswordResetRequestSchema,
    userPasswordResetSchema,
} from "../database/schemas";
import type { PublicUser, UserRow } from "../types";

type UsernameParams = { username: string };
type MessageResponse = { message: string };
type LoginResponse = Pick<UserRow, "id" | "username" | "role">;
type AdminCreationCodeResponse = { message: string; expires_in_seconds: number };
type CreateAdminResponse = {
    user: PublicUser;
    admin_notifications: { sent: number; failed: number };
};
type AdminEmailRow = { email: string };

const router = express.Router();

router.post("/user/login", async (req, res) => await login(req, res));
router.post("/user/admin_creation_code", requireBusinessKey, async (req, res) => await requestAdminCreationCode(req, res));
router.post("/user/new_admin", requireBusinessKey, async (req, res) => await createAdmin(req, res));
router.post("/user/new_manager", requireBusinessKey, async (req, res) => await createUser(req, res, "MANAGER"));
router.post("/user/reset_password_request", async (req, res) => await requestPasswordResetByEmail(req, res));
router.post("/user/reset_password", async (req, res) => await resetPasswordByEmail(req, res));
router.post("/user/:username/reset_password_request", async (req, res) => await requestPasswordResetByUsername(req, res));
router.post("/user/:username/reset_password", async (req, res) => await resetPasswordByUsername(req, res));

// ========================================

const login = async (req: Request, res: Response<LoginResponse>): Promise<void> => {
    const data = parseInput(userLoginSchema, req.body);
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_USERNAME, [data.username]);

    if (!user || !user.active || !(await verifyPassword(data.password, user.password_hash))) {
        throw unauthorized("Invalid username or password");
    }

    res.json({ id: user.id, username: user.username, role: user.role });
};

// ========================================

const createUser = async (req: Request, res: Response<PublicUser>, role: UserRow["role"]): Promise<void> => {
    const data = parseInput(userCreateSchema, req.body);

    const created = await dbGet<PublicUser>(sql, QUERIES.POST.USER, [
        newId(),
        data.username,
        await hashPassword(data.password),
        data.email,
        role,
    ]);

    res.status(201).json(requireRow(created, "user"));
};

// ========================================

const requestAdminCreationCode = async (
    req: Request,
    res: Response<AdminCreationCodeResponse>
): Promise<void> => {
    const data = parseInput(adminCreationCodeRequestSchema, req.body);
    const adminEmails = await dbAll<AdminEmailRow>(sql, QUERIES.GET.ADMIN_EMAILS);

    if (adminEmails.length === 0) {
        throw conflict("No active admin email addresses are configured; seed the first admin manually");
    }

    const code = issueAdminCreationCode(data.username, data.email);
    const message = [
        `An admin account creation was requested for ${data.username} (${data.email}).`,
        `Verification code: ${code}`,
        `The code expires in ${ADMIN_CREATION_CODE_WINDOW_MS / 60_000} minutes and can only be used once.`,
        "If you did not expect this request, do not share the code.",
    ].join("\n");

    const results = await Promise.allSettled(adminEmails.map(({ email }) => sendEmail({
        to: email,
        subject: "Admin account creation verification",
        title: "Admin account verification",
        message,
    })));
    const failed = results.filter(result => result.status === "rejected").length;

    if (failed > 0) {
        discardAdminCreationCode(data.username, data.email);
        throw new Error(`Failed to send admin creation verification email to ${failed} administrator(s)`);
    }

    res.json({
        message: "Verification code sent to all active administrators",
        expires_in_seconds: ADMIN_CREATION_CODE_WINDOW_MS / 1000,
    });
};

// ========================================

const createAdmin = async (req: Request, res: Response<CreateAdminResponse>): Promise<void> => {
    const data = parseInput(adminCreateSchema, req.body);
    const adminEmails = await dbAll<AdminEmailRow>(sql, QUERIES.GET.ADMIN_EMAILS);

    if (adminEmails.length === 0) {
        throw conflict("No active admin email addresses are configured; seed the first admin manually");
    }

    if (!consumeAdminCreationCode(data.username, data.email, data.verification_code)) {
        throw badRequest("Invalid or expired verification code");
    }

    const created = await dbGet<PublicUser>(sql, QUERIES.POST.USER, [
        newId(),
        data.username,
        await hashPassword(data.password),
        data.email,
        "ADMIN",
    ]);
    const user = requireRow(created, "user");
    const notification = [
        `A new admin account has been created for ${user.username} (${user.email}).`,
        "If you did not expect this, contact the business owner.",
    ].join("\n");
    const results = await Promise.allSettled(adminEmails.map(({ email }) => sendEmail({
        to: email,
        subject: "New admin account created",
        title: "New admin account",
        message: notification,
    })));
    const sent = results.filter(result => result.status === "fulfilled").length;

    res.status(201).json({
        user,
        admin_notifications: { sent, failed: results.length - sent },
    });
};

// ========================================

const requestPasswordResetByEmail = async (req: Request, res: Response<MessageResponse>): Promise<void> => {
    const { email } = parseInput(userPasswordResetRequestSchema, req.body);
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_EMAIL, [email]);

    if (user?.active && user.email) {
        const code = issueResetCode(user.id);

        try {
            await sendEmail({
                to: user.email,
                subject: "Your password reset code",
                title: "Password reset",
                message: [
                    `Your password reset code is ${code}`,
                    `It expires in ${RESET_WINDOW_MS / 60_000} minutes.`,
                    "If you did not ask for this, you can ignore this email.",
                ].join("\n"),
            });
        } catch (err) {
            discardResetCode(user.id);
            throw err;
        }
    }

    res.json({ message: "If the account exists, a reset code has been sent to its email" });
};

// ========================================

const resetPasswordByEmail = async (req: Request, res: Response<MessageResponse>): Promise<void> => {
    const data = parseInput(userPasswordResetSchema, req.body);
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_EMAIL, [data.email]);

    if (!user?.active || !consumeResetCode(user.id, data.reset_code)) {
        throw badRequest("Invalid or expired reset code");
    }

    const updated = await dbGet(sql, QUERIES.PUT.USER_PASSWORD, [user.id, await hashPassword(data.new_password)]);
    requireRow(updated, "user");

    res.json({ message: "Password updated" });
};

// ========================================

const requestPasswordResetByUsername = async (req: Request<UsernameParams>, res: Response<MessageResponse>): Promise<void> => {
    const { username } = req.params;
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_USERNAME, [username]);

    if (user?.active && user.email) {
        const code = issueResetCode(user.id);

        try {
            await sendEmail({
                to: user.email,
                subject: "Your password reset code",
                title: "Password reset",
                message: [
                    `Your password reset code is ${code}`,
                    `It expires in ${RESET_WINDOW_MS / 60_000} minutes.`,
                    "If you did not ask for this, you can ignore this email.",
                ].join("\n"),
            });
        } catch (err) {
            discardResetCode(user.id);
            throw err;
        }
    }

    res.json({ message: "If the account exists, a reset code has been sent to its email" });
};

// ========================================

const resetPasswordByUsername = async (req: Request<UsernameParams>, res: Response<MessageResponse>): Promise<void> => {
    const { username } = req.params;
    const data = parseInput(userPasswordResetLegacySchema, req.body);
    const user = await dbGet<UserRow>(sql, QUERIES.GET.USER_BY_USERNAME, [username]);

    if (!user?.active || !consumeResetCode(user.id, data.reset_code)) {
        throw badRequest("Invalid or expired reset code");
    }

    const updated = await dbGet(sql, QUERIES.PUT.USER_PASSWORD, [user.id, await hashPassword(data.new_password)]);
    requireRow(updated, "user");

    res.json({ message: "Password updated" });
};

// ========================================

export default router;
