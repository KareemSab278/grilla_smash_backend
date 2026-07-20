import express from "express";
import sql from "../db";
import { QUERIES } from "../queries";
import {
	CartItem,
	CreateOrderRequest,
	KdsOrderPayload,
	Order,
	OrdersResponse,
	OrderStatus,
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
			customer_email,
			customer_address1,
			customer_address2,
			customer_city,
			customer_postcode,
			is_pickup,
			delivery_fee,
			total,
			order_status,
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

		const createdOrder = await sql.unsafe<{ id: string }[]>(
			QUERIES.POST.ORDER,
			[
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
			]
		);

		const orderId = createdOrder[0]?.id;
		if (!orderId) {
			return res.status(500).json({ error: "Failed to create order" });
		}

		await sql`
			INSERT INTO order_items ${
				sql(items.map(item => ({
					order_id: orderId,
					product_id: item.product_id,
					quantity: item.quantity,
					price: item.price,
				})))
			}
		`;

		return res.status(201).json({
			order_id: orderId,
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
		order_status: data.status as OrderStatus,
		items: (data.items ?? []).map((item: CartItem) => ({
			product_id: Number(item.product?.id ?? item.id),
			quantity: Number(item.quantity ?? 1),
			price: Number(item.product?.price ?? 0),
		})),
	};
};
