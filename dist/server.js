"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const payments_1 = __importDefault(require("./requestHandlers/payments"));
const menu_1 = __importDefault(require("./requestHandlers/menu"));
const health_1 = __importDefault(require("./requestHandlers/health"));
const orders_1 = __importDefault(require("./requestHandlers/orders"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use("/api", health_1.default);
app.use("/api", payments_1.default);
app.use("/api", menu_1.default);
app.use("/api", orders_1.default);
app.listen(6969, () => {
    console.log("Server running on port 6969");
});
