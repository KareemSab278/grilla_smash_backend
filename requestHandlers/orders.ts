import express from "express";
import sql from "../db";
import { QUERIES } from "../queries";
import {
	CartItem,
	CreateOrderRequest,
	KdsOrderPayload,
	Order,
	OrdersResponse,
	UpdateOrderStatusRequest,
	UpdateOrderStatusResponse,
} from "../types";

const router = express.Router();

router.get("/orders", async (_req, res) => {
	try {
		const orders = await sql.unsafe<Order[]>(QUERIES.GET.ORDERS);

		const response: OrdersResponse = { orders };

		return res.json(response);
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: (err as Error).message,
		});
	}
});

router.post("/orders", async (req, res) => {
    console.log("Received request to create order:", req.body);
	try {
		const body = req.body as CreateOrderRequest | KdsOrderPayload;

		const isKdsPayload =
			body && typeof body === "object" && "orderData" in body;

		const normalizedOrder = isKdsPayload
			? mapKdsPayloadToCreateOrder(body as KdsOrderPayload)
			: (body as CreateOrderRequest);

		const {
			branch_id,
			customer_name,
			customer_phone,
			total,
			items,
		} = normalizedOrder;

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

		const createdRows = await sql.unsafe<{ order_id: string }[]>(
			QUERIES.POST.ORDER,
			[
				branch_id,
				customer_name,
				customer_phone ?? null,
				total,
				JSON.stringify(items),
			]
		);

		return res.status(201).json({
			order_id: createdRows[0]?.order_id,
            message: "Order created successfully"
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: (err as Error).message,
		});
	}
});

router.patch("/orders/status", async (req, res) => {
    console.log("Received request to update order status:", req.body);
	try {
		const { id, status } = req.body as UpdateOrderStatusRequest;

		if (!id || !status) {
			return res.status(400).json({
				error: "id and status are required",
			});
		}

		const updated = await sql.unsafe<UpdateOrderStatusResponse[]>(
			QUERIES.PATCH.ORDER_STATUS,
			[id, status]
		);

		if (!updated[0]) {
			return res.status(404).json({
				error: "order not found",
			});
		}

		return res.json(updated[0]);
	} catch (err) {
		console.error(err);
		return res.status(500).json({
			error: (err as Error).message,
		});
	}
});

export default router;

const mapKdsPayloadToCreateOrder = (payload: KdsOrderPayload): CreateOrderRequest => {
	const data = payload.orderData;

	return {
		branch_id: String(data.storeId),
		customer_name: data.customer.fullName,
		customer_phone: payload.TEL || data.customer.phone,
		total: Number(data.total),
		items: (data.items ?? []).map((item: CartItem) => ({
			product_id: Number(item.product?.id ?? item.id),
			quantity: Number(item.quantity ?? 1),
			price: Number(item.product?.price ?? 0),
		})),
	};
};
