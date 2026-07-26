"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = require("express");
const router = (0, express_1.Router)();
dotenv_1.default.config();
router.get("/route/:location", async (req, res) => {
    const { location } = req.params;
    try {
        const coords = await getLatLng(location);
        return res.json({ coords });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message,
        });
    }
});
const getLatLng = async (address) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GOOGLE_MAPS_API_KEY");
    }
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`);
    const data = await response.json();
    if (data.status !== "OK" || !data.results.length) {
        throw new Error("Address not found");
    }
    const { lat, lng } = data.results[0].geometry.location;
    return { lat, lng };
};
exports.default = router;
