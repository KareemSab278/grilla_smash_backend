import express from "express";
import type { Request, Response } from "express";
import { checkDb } from "../db";

const router = express.Router();

router.get("/", (req, res) => getRoot(req, res));
router.get("/health", async (req, res) => await getHealth(req, res));

// ========================================

type RootResponse = {
    name: string;
    version: string;
    status: "running";
};

type HealthResponse = {
    status: "ok";
};

// ========================================

const getRoot = (_req: Request, res: Response<RootResponse>): void => {
    res.json({
        name: "Ordering System API",
        version: "1.0.0",
        status: "running",
    });
};

// fails (500) when the database is unreachable, so uptime monitors see real health
const getHealth = async (_req: Request, res: Response<HealthResponse>): Promise<void> => {
    await checkDb();

    res.json({ status: "ok" });
};

// ========================================

export default router;
