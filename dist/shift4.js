"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shift4Client = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const shift4 = require("shift4");
const secretKey = process.env.SHIFT4_SECRET_KEY;
if (!secretKey) {
    throw new Error("Missing Shift4 secret key. Set SHIFT4_SECRET_KEY.");
}
exports.shift4Client = shift4({
    secretKey,
});
