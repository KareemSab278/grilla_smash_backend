import express from "express";
import sql from "../db";
import { QUERIES } from "../queries";
import { keysMatch } from "../helpers";
import {
	CartItem,
	CreateOrderRequest,
	KdsOrderPayload,
	Order,
	OrderStatus,
	UpdateOrderStatusRequest,
	UpdateOrderStatusResponse,
} from "../types";
import { sendOrderStatusUpdateEmail } from "../helpers";

const router = express.Router();

router.get("/orders/:branchId", async (req, res) => {
	const { branchId } = req.params;
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith("Bearer ")) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	const rawKey = authHeader.slice(7);
	const [branch] = await sql.unsafe<{ branch_key: string }[]>(
		QUERIES.GET.BRANCH_KEY, [branchId]
	);
	if (!branch?.branch_key || !keysMatch(rawKey, branch.branch_key)) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	try {
		const orders = await sql.unsafe<Order[]>(QUERIES.GET.ORDERS_BY_BRANCH_ID, [branchId]);
		return res.json({ orders });
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
			payment_id: paymentId // REQUIRED: Ensure payment_id is included in the normalized order.
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
				paymentId
			]
		);

		const orderId = createdOrder[0]?.id;
		if (!orderId) {
			return res.status(500).json({ error: "Failed to create order" });
		}

		const insertedItems = await sql<{ id: string }[]>`
			INSERT INTO order_items ${sql(items.map(item => ({
			order_id: orderId,
			product_id: item.product_id,
			quantity: item.quantity,
			price: item.price,
			sauce_choice: item.sauce_choice ?? null,
		})))}
			RETURNING id
		`;

		const orderItemOptions = insertedItems.flatMap((insertedItem, index) =>
			(items[index].extras ?? []).map(extra => ({
				order_item_id: insertedItem.id,
				option_id: extra.id,
				price: extra.price,
			}))
		);

		if (orderItemOptions.length > 0) {
			await sql`INSERT INTO order_item_options ${sql(orderItemOptions)}`;
		}

		const orderItemMeals = insertedItems
			.map((insertedItem, index) => {
				const meal = items[index].meal;
				if (!meal) return null;
				return {
					order_item_id: insertedItem.id,
					drink_id: meal.drink.id,
					side_id: meal.side.id,
				};
			})
			.filter((m): m is NonNullable<typeof m> => m !== null);

		if (orderItemMeals.length > 0) {
			await sql`INSERT INTO order_item_meals ${sql(orderItemMeals)}`;
		}

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

		const authHeader = req.headers.authorization;
		if (!authHeader?.startsWith("Bearer ")) {
			return res.status(401).json({ error: "Unauthorized" });
		}
		const rawKey = authHeader.slice(7);
		const [orderBranch] = await sql.unsafe<{ branch_key: string }[]>(
			QUERIES.GET.BRANCH_KEY_BY_ORDER, [id]
		);
		if (!orderBranch?.branch_key || !keysMatch(rawKey, orderBranch.branch_key)) {
			return res.status(401).json({ error: "Unauthorized" });
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

		sendOrderStatusUpdateEmail(status, id);

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
		payment_id: payload.paymentId ?? "ERROR GETTING PAYMENT ID", // REQUIRED: Ensure payment_id is included in the normalized order.
		items: (data.items ?? []).map((item: CartItem) => ({
			product_id: Number(item.product?.id ?? item.id),
			quantity: Number(item.quantity ?? 1),
			price: Number(item.product?.price ?? 0),
			extras: item.extras?.filter(e => e.id != null).map(e => ({ id: e.id!, price: e.price ?? 0 })),
			sauce_choice: item.sauceChoice ?? undefined,
			meal: item.meal ?? null,
		})),
	};
};
