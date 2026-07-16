import express from "express";

const router = express.Router();

router.get("/health", async (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});

export default router;