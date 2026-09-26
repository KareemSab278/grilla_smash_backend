import express from "express";
import { QUERIES } from "../queries";
import sql from "../db";
import { Branch } from "../types";
import { keysMatch } from "../helpers";

const router = express.Router();


router.get("/health", async (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});


router.get("/all-branches", async (req, res) => {
    try {
        const branches = await sql.unsafe<[Branch[]]>(QUERIES.GET["ALL-BRANCHES"]);

        return res.json({
            success: true,
            branches: branches
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: (err as Error).message
        });
    }
});


router.get("/unavailable-products", async (req, res) => {
    try {
        const branch_id = req.query.branch_id as string;
        const [branch] = await sql.unsafe<{ id: string; active: boolean; unavailable_products: number[] }[]>(
            QUERIES.GET["UNAVAILABLE_PRODUCTS"], [branch_id]
        );

        return res.json({
            success: true,
            branch_id: branch?.id,
            active: branch?.active,
            unavailable_products: branch?.unavailable_products ?? []
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: (err as Error).message
        });
    }
});

router.patch("/unavailable-products", async (req, res) => {
    const { branch_id, unavailable_products } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rawKey = authHeader.slice(7);
    const [branch] = await sql.unsafe<{ branch_key: string }[]>(
        QUERIES.GET.BRANCH_KEY, [branch_id]
    );

    if (!branch?.branch_key || !keysMatch(rawKey, branch.branch_key)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    if (!branch_id || !Array.isArray(unavailable_products)) {
        return res.status(400).json({
            success: false,
            error: "Missing required parameters",
            error_message: "branch_id and unavailable_products are required and unavailable_products must be an array!"
        });
    }

    try {
        const [updatedBranch] = await sql.unsafe<{ id: string; unavailable_products: number[] }[]>(
            QUERIES.PATCH.UPDATE_UNAVAILABLE_PRODUCTS, [branch_id, unavailable_products]
        );

        return res.json({
            success: true,
            message: `Unavailable products updated for branch ${branch_id}`,
            branch: updatedBranch
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: (err as Error).message
        });
    }
});


router.patch("/branch-status", async (req, res) => {
    const { branch_id, status } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const rawKey = authHeader.slice(7);
    const [branch] = await sql.unsafe<{ branch_key: string }[]>(
        QUERIES.GET.BRANCH_KEY, [branch_id]
    );

    if (!branch?.branch_key || !keysMatch(rawKey, branch.branch_key)) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
    }


    if (!branch_id || (status !== true && status !== false)) { // check if status is strictly true or false
        return res.status(400).json({
            success: false,
            error: "Missing required parameters",
            error_message: "branch_id and status are required and status must be a boolean!"
        });
    }

    // if status is false or true then set active to false or true respectively

    try {
        await sql.unsafe(QUERIES.PATCH.BRANCH_STATUS, [branch_id, status]);

        return res.json({
            success: true,
            message: `Branch status updated to ${status}`
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: (err as Error).message
        });
    }
});


export default router;