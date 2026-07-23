"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const queries_1 = require("../queries");
const db_1 = __importDefault(require("../db"));
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
exports.default = router;
