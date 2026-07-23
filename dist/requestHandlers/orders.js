"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../db"));
const queries_1 = require("../queries");
const router = express_1.default.Router();
router.get("/orders/:branchId", async (req, res) => {
    const { branchId } = req.params;
    try {
        const orders = await db_1.default.unsafe(queries_1.QUERIES.GET.ORDERS_BY_BRANCH_ID, [branchId]);
        return res.json({ orders });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({
            error: err.message,
        });
    }
});
router.post("/orders", async (req, res) => {
    console.log("Received request to create order:", req.body);
    try {
        const body = req.body;
        const isKdsPayload = body && typeof body === "object" && "orderData" in body;
        const normalizedOrder = isKdsPayload
            ? mapKdsPayloadToCreateOrder(body)
            : body;
        const { branch_id, customer_name, customer_phone, customer_email, customer_address1, customer_address2, customer_city, customer_postcode, is_pickup, delivery_fee, total, order_status, items, } = normalizedOrder;
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
        const createdOrder = await db_1.default.unsafe(queries_1.QUERIES.POST.ORDER, [
            branch_id,
            customer_name,
            customer_phone ?? null,
            customer_email ?? null,
            customer_address1 ?? null,
            customer_address2 ?? null,
            customer_city ?? null,
            customer_postcode ?? null,
            is_pickup ?? false,
            delivery_fee ?? null,
            total,
            order_status ?? "pending",
        ]);
        const orderId = createdOrder[0]?.id;
        if (!orderId) {
            return res.status(500).json({ error: "Failed to create order" });
        }
        const insertedItems = await (0, db_1.default) `
			INSERT INTO order_items ${(0, db_1.default)(items.map(item => ({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
            price: item.price,
            sauce_choice: item.sauce_choice ?? null,
        })))}
			RETURNING id
		`;
        const orderItemOptions = insertedItems.flatMap((insertedItem, index) => (items[index].extras ?? []).map(extra => ({
            order_item_id: insertedItem.id,
            option_id: extra.id,
            price: extra.price,
        })));
        if (orderItemOptions.length > 0) {
            await (0, db_1.default) `INSERT INTO order_item_options ${(0, db_1.default)(orderItemOptions)}`;
        }
        const orderItemMeals = insertedItems
            .map((insertedItem, index) => {
            const meal = items[index].meal;
            if (!meal)
                return null;
            return {
                order_item_id: insertedItem.id,
                drink_id: meal.drink.id,
                side_id: meal.side.id,
            };
        })
            .filter((m) => m !== null);
        if (orderItemMeals.length > 0) {
            await (0, db_1.default) `INSERT INTO order_item_meals ${(0, db_1.default)(orderItemMeals)}`;
        }
        return res.status(201).json({
            order_id: orderId,
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
    console.log("Received request to update order status:", req.body);
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
    const customer = data.customer;
    return {
        branch_id: String(data.storeId),
        customer_name: customer.fullName,
        customer_phone: payload.TEL || customer.phone,
        customer_email: customer.email,
        customer_address1: customer.address1,
        customer_address2: customer.address2,
        customer_city: customer.city,
        customer_postcode: customer.postcode,
        is_pickup: data.isPickup,
        delivery_fee: data.isPickup ? undefined : data.delivery,
        total: Number(data.total),
        order_status: data.status,
        items: (data.items ?? []).map((item) => ({
            product_id: Number(item.product?.id ?? item.id),
            quantity: Number(item.quantity ?? 1),
            price: Number(item.product?.price ?? 0),
            extras: item.extras?.filter(e => e.id != null).map(e => ({ id: e.id, price: e.price ?? 0 })),
            sauce_choice: item.sauceChoice ?? undefined,
            meal: item.meal ?? null,
        })),
    };
};
