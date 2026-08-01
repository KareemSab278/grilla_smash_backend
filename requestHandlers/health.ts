import express from "express";
import { QUERIES } from "../queries";
import sql from "../db";
import { Branch } from "../types";

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

router.patch("/branch-status", async (req, res) => {
    const { branch_id, status } = req.body;

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