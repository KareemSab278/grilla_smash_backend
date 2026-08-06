"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const queries_1 = require("../queries");
const db_1 = __importDefault(require("../db"));
const helpers_1 = require("../helpers");
const router = express_1.default.Router();
router.get("/health", async (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});
router.get("/all-branches", async (req, res) => {
    try {
        const branches = await db_1.default.unsafe(queries_1.QUERIES.GET["ALL-BRANCHES"]);
        return res.json({
            success: true,
            branches: branches
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: err.message
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
    const [branch] = await db_1.default.unsafe(queries_1.QUERIES.GET.BRANCH_KEY, [branch_id]);
    if (!branch?.branch_key || !(0, helpers_1.keysMatch)(rawKey, branch.branch_key)) {
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
        await db_1.default.unsafe(queries_1.QUERIES.PATCH.BRANCH_STATUS, [branch_id, status]);
        return res.json({
            success: true,
            message: `Branch status updated to ${status}`
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            error_message: err.message
        });
    }
});
exports.default = router;
