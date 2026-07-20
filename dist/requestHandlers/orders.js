"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../db"));
const queries_1 = require("../queries");
const router = express_1.default.Router();
router.get("/orders", async (_req, res) => {
    try {
        const orders = await db_1.default.unsafe(queries_1.QUERIES.GET.ORDERS);
        const response = { orders };
        return res.json(response);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message,
        });
    }
});
router.post("/orders", async (req, res) => {
    try {
        const body = req.body;
        const isKdsPayload = body && typeof body === "object" && "orderData" in body;
        const normalizedOrder = isKdsPayload
            ? mapKdsPayloadToCreateOrder(body)
            : body;
        const { branch_id, customer_name, customer_phone, total, items, } = normalizedOrder;
        if (!branch_id || !customer_name || !Number.isFinite(total)) {
            return res.status(400).json({
                error: "branch_id, customer_name and total are required",
            });
        }
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                error: "items must be a non-empty array",
            });
        }
        const createdRows = await db_1.default.unsafe(queries_1.QUERIES.POST.ORDER, [
            branch_id,
            customer_name,
            customer_phone ?? null,
            total,
            JSON.stringify(items),
        ]);
        return res.status(201).json({
            order_id: createdRows[0]?.order_id,
            message: "Order created successfully"
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message,
        });
    }
});
router.patch("/orders/status", async (req, res) => {
    try {
        const { id, status } = req.body;
        if (!id || !status) {
            return res.status(400).json({
                error: "id and status are required",
            });
        }
        const updated = await db_1.default.unsafe(queries_1.QUERIES.PATCH.ORDER_STATUS, [id, status]);
        if (!updated[0]) {
            return res.status(404).json({
                error: "order not found",
            });
        }
        return res.json(updated[0]);
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message,
        });
    }
});
exports.default = router;
const mapKdsPayloadToCreateOrder = (payload) => {
    const data = payload.orderData;
    return {
        branch_id: String(data.storeId),
        customer_name: data.customer.fullName,
        customer_phone: payload.TEL || data.customer.phone,
        total: Number(data.total),
        items: (data.items ?? []).map((item) => ({
            product_id: Number(item.product?.id ?? item.id),
            quantity: Number(item.quantity ?? 1),
            price: Number(item.product?.price ?? 0),
        })),
    };
};
