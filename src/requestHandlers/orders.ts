import express from "express";
import type { Request, Response } from "express";
import { newId, orNull, groupBy, requireRow, unique } from "../helpers";
import { parseInput } from "../middleware/validate";
import { createOrderSchema, updateOrderStatusSchema } from "../schemas";
import sql, { dbAll, dbGet, dbRun, transaction } from "../db";
import { notFound } from "../errors";
import { QUERIES } from "../queries";
import type {
    CreateOrderResponse,
    Order,
    OrderItemModifier,
    OrderStatus,
    OrdersResponse,
    UpdateOrderStatusResponse,
} from "../types";

const router = express.Router();

router.get("/orders/:branchId", async (req, res) => await getActiveOrders(req, res));
router.get("/orders/history/:branchId", async (req, res) => await getOrderHistory(req, res));
router.post("/orders", async (req, res) => await createOrder(req, res));
router.patch("/orders/status", async (req, res) => await updateOrderStatus(req, res));

// ========================================

type BranchParams = { branchId: string };

type OrderRow = {
    id: string;
    branch_id: string;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    customer_address1: string | null;
    customer_address2: string | null;
    customer_city: string | null;
    customer_postcode: string | null;
    is_pickup: boolean;
    delivery_fee: number | null;
    total: number;
    order_status: OrderStatus;
    order_notes: string | null;
    payment_id: string | null;
    created_at: Date;
};

type OrderItemRow = {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name: string | null;
    quantity: number;
    price: number;
    sauce_choice: string | null;
    notes: string | null;
};

type OrderItemModifierRow = {
    id: string;
    order_item_id: string;
    modifier_id: string | null;
    name: string;
    price: number;
    quantity: number;
};

type ProductNameRow = {
    id: string;
    name: string;
};

// ========================================

const TERMINAL_STATUSES: readonly OrderStatus[] = ["delivered", "refunded", "completed"];

const getBranch = async (branchId: string): Promise<void> => {
    const branch = await dbGet<{ id: string }>(sql, QUERIES.GET.BRANCH_BY_ID, [branchId]);
    if (!branch) throw notFound("branch not found");
};

const loadOrders = async (branchId: string, sinceClause: "30 days" | null): Promise<Order[]> => {
    const orders = await dbAll<OrderRow>(
        sql,
        sinceClause === "30 days"
            ? `
                SELECT
                    id,
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
                    order_notes,
                    payment_id,
                    created_at
                FROM orders
                WHERE branch_id = $1
                  AND created_at >= NOW() - INTERVAL '30 days'
                ORDER BY created_at DESC;
              `
            : `
                SELECT
                    id,
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
                    order_notes,
                    payment_id,
                    created_at
                FROM orders
                WHERE branch_id = $1
                  AND order_status <> ALL($2::text[])
                ORDER BY created_at DESC;
              `,
        sinceClause ? [branchId] : [branchId, TERMINAL_STATUSES]
    );

    if (orders.length === 0) {
        return [];
    }

    const orderIds = orders.map(order => order.id);
    const orderItems = await dbAll<OrderItemRow>(
        sql,
        `
            SELECT
                oi.id,
                oi.order_id,
                oi.product_id,
                p.name AS product_name,
                oi.quantity,
                oi.price,
                oi.sauce_choice,
                oi.notes
            FROM order_items oi
            LEFT JOIN products p
                ON p.id = oi.product_id
            WHERE oi.order_id = ANY($1::text[])
            ORDER BY oi.id;
        `,
        [orderIds]
    );

    const itemIds = orderItems.map(item => item.id);
    const itemModifiers = itemIds.length
        ? await dbAll<OrderItemModifierRow>(
              sql,
              `
                  SELECT
                      id,
                      order_item_id,
                      modifier_id,
                      name,
                      price,
                      quantity
                  FROM order_item_modifiers
                  WHERE order_item_id = ANY($1::text[])
                  ORDER BY id;
              `,
              [itemIds]
          )
        : [];

    const modifiersByItem = groupBy(itemModifiers, modifier => modifier.order_item_id);
    const itemsByOrder = groupBy(orderItems, item => item.order_id);

    return orders.map(order => ({
        ...order,
        items: (itemsByOrder.get(order.id) ?? []).map(item => ({
            product_id: item.product_id ?? "",
            product_name: item.product_name ?? "",
            quantity: item.quantity,
            price: item.price,
            sauce_choice: item.sauce_choice,
            notes: item.notes,
            modifiers: (modifiersByItem.get(item.id) ?? []).map<OrderItemModifier>(modifier => ({
                modifier_id: modifier.modifier_id,
                name: modifier.name,
                price: modifier.price,
                quantity: modifier.quantity,
            })),
        })),
    }));
};

const loadProductMap = async (productIds: readonly string[]): Promise<Map<string, string>> => {
    const uniqueProductIds = unique(productIds);
    const products = uniqueProductIds.length
        ? await dbAll<ProductNameRow>(sql, `SELECT id, name FROM products WHERE id = ANY($1::text[])`, [uniqueProductIds])
        : [];

    if (products.length !== uniqueProductIds.length) {
        throw notFound("one or more products not found");
    }

    return new Map(products.map(product => [product.id, product.name]));
};

const validateModifiersExist = async (modifierIds: readonly string[]): Promise<void> => {
    const uniqueModifierIds = unique(modifierIds);
    const modifiers = uniqueModifierIds.length
        ? await dbAll<{ id: string }>(sql, `SELECT id FROM modifiers WHERE id = ANY($1::text[])`, [uniqueModifierIds])
        : [];

    if (modifiers.length !== uniqueModifierIds.length) {
        throw notFound("one or more modifiers not found");
    }
};

// ========================================

const getActiveOrders = async (req: Request<BranchParams>, res: Response<OrdersResponse>): Promise<void> => {
    await getBranch(req.params.branchId);
    res.json({ orders: await loadOrders(req.params.branchId, null) });
};

const getOrderHistory = async (req: Request<BranchParams>, res: Response<OrdersResponse>): Promise<void> => {
    await getBranch(req.params.branchId);
    res.json({ orders: await loadOrders(req.params.branchId, "30 days") });
};

const createOrder = async (req: Request, res: Response<CreateOrderResponse>): Promise<void> => {
    const data = parseInput(createOrderSchema, req.body);

    await getBranch(data.branch_id);
    const productNames = await loadProductMap(data.items.map(item => item.product_id));
    await validateModifiersExist(
        data.items.flatMap(item => (item.modifiers ?? []).map(modifier => modifier.id))
    );

    const orderId = await transaction(async tx => {
        const createdOrder = await dbGet<{ id: string }>(
            tx,
            `
                INSERT INTO orders (
                    id,
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
                    payment_id,
                    order_notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id;
            `,
            [
                newId(),
                data.branch_id,
                data.customer_name,
                orNull(data.customer_phone),
                orNull(data.customer_email),
                orNull(data.customer_address1),
                orNull(data.customer_address2),
                orNull(data.customer_city),
                orNull(data.customer_postcode),
                Boolean(data.is_pickup),
                orNull(data.delivery_fee),
                data.total,
                data.order_status ?? "received",
                data.payment_id,
                orNull(data.order_notes),
            ]
        );

        const orderRow = requireRow(createdOrder, "order");

        for (const item of data.items) {
            const createdItem = await dbGet<{ id: string }>(
                tx,
                `
                    INSERT INTO order_items (
                        id,
                        order_id,
                        product_id,
                        name,
                        quantity,
                        price,
                        notes,
                        sauce_choice
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id;
                `,
                [
                    newId(),
                    orderRow.id,
                    item.product_id,
                    productNames.get(item.product_id) ?? item.product_id,
                    item.quantity,
                    item.price,
                    orNull(item.notes),
                    orNull(item.sauce_choice),
                ]
            );

            const itemRow = requireRow(createdItem, "order item");

            for (const modifier of item.modifiers ?? []) {
                await dbRun(
                    tx,
                    `
                        INSERT INTO order_item_modifiers (
                            id,
                            order_item_id,
                            modifier_id,
                            name,
                            price,
                            quantity
                        )
                        VALUES ($1, $2, $3, $4, $5, $6);
                    `,
                    [
                        newId(),
                        itemRow.id,
                        modifier.id,
                        modifier.name,
                        modifier.price,
                        modifier.quantity ?? 1,
                    ]
                );
            }
        }

        return orderRow.id;
    });

    res.status(201).json({
        order_id: orderId,
        message: "Order created successfully",
    });
};

const updateOrderStatus = async (
    req: Request,
    res: Response<UpdateOrderStatusResponse>
): Promise<void> => {
    const data = parseInput(updateOrderStatusSchema, req.body);

    const updated = await dbGet<UpdateOrderStatusResponse>(
        sql,
        `
            UPDATE orders
            SET order_status = $2
            WHERE id = $1
            RETURNING id, order_status;
        `,
        [data.id, data.status]
    );

    if (!updated) {
        throw notFound("order not found");
    }

    res.json(updated);
};

// ========================================

export default router;
