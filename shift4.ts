import dotenv from "dotenv";
dotenv.config();

const shift4 = require("shift4");

const secretKey = process.env.SHIFT4_SECRET_KEY;
if (!secretKey) {
    throw new Error("Missing Shift4 secret key. Set SHIFT4_SECRET_KEY.");
}

export const shift4Client = shift4({
    secretKey,
});
