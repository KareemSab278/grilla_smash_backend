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


export default router;