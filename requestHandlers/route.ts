import dotenv from "dotenv";
import { Router } from "express";
const router = Router();
dotenv.config();


router.get("/route/:location", async (req, res) => {
    const { location } = req.params;
    try {
        const coords = await getLatLng(location);
        return res.json({ coords });
    } catch (err) {
        console.error(err);
        return res.status(500).json({
            error: (err as Error).message,
        });
    }
});



const getLatLng = async (address: string): Promise<{ lat: number; lng: number }> => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        throw new Error("Missing GOOGLE_MAPS_API_KEY");
    }

    const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            address
        )}&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status !== "OK" || !data.results.length) {
        throw new Error("Address not found");
    }

    const { lat, lng } = data.results[0].geometry.location;

    return { lat, lng };
}


export default router;