/*
    ORDER ROUTES

    POST  /orders                     create an order
    GET   /orders/:branchId           ACTIVE orders (PENDING / ACCEPTED / PREPARING / READY), newest first
    GET   /orders/history/:branchId   every order from the last 30 days, any status, newest first
    PATCH /orders/status              { id, status }

    Pricing is done by the server, the client only sends ids.

    Unit price = branch override or product price + selected modifiers.

    Product / modifier names and prices are copied onto the order (snapshots)
        so later menu edits never change old orders.

    Modifiers are checked against the groups attached to the product
        (membership, required, min / max).

    order_number is a per-branch counter, allocated under an advisory lock
        so simultaneous orders can never get the same number.

    The whole create runs in one transaction.
*/

import express from "express";
import type { Request, Response } from "express";
import { QUERIES } from "../queries";
import sql, { dbAll, dbGet, dbRun, transaction } from "../db";
import type { Db } from "../db";
import { badRequest, notFound } from "../errors";
import { getRequiredRow, groupBy, newId, orNull, requireRow, unique } from "../helpers";
import { parseInput } from "../middleware/validate";
import { orderCreateSchema, orderStatusUpdateSchema } from "../schemas";
import type { OrderCreate } from "../schemas";
import type {
    BranchRow,
    OrderItemModifierRow,
    OrderItemResponse,
    OrderItemRow,
    OrderPricingGroupRow,
    OrderPricingModifierRow,
    OrderPricingProductRow,
    OrderResponse,
    OrderRow,
    OrderStatus,
    OrderStatusResponse,
} from "../types";

const router = express.Router();

router.get("/orders/history/:branchId", async (req, res) => await getOrderHistory(req, res));
router.get("/orders/:branchId", async (req, res) => await getActiveOrders(req, res));
router.post("/orders", async (req, res) => await createOrder(req, res));
router.patch("/orders/status", async (req, res) => await updateOrderStatus(req, res));

// ========================================

type BranchParams = { branchId: string };

type OrdersResponse = { orders: OrderResponse[] };

type CreateOrderResponse = {
    order_id: string;
    order_number: number;
    subtotal: number;
    total: number;
    message: string;
};

// what the kitchen / KDS still has to deal with
const ACTIVE_STATUSES: readonly OrderStatus[] = ["PENDING", "ACCEPTED", "PREPARING", "READY"];

// ========================================
// READ
// ========================================

// two queries for all items and all modifiers of the given orders, stitched together in memory
const attachItems = async (db: Db, orders: readonly OrderRow[]): Promise<OrderResponse[]> => {
    if (orders.length === 0) return [];

    const items = await dbAll<OrderItemRow>(db, QUERIES.GET.ORDER_ITEMS, [orders.map(order => order.id)]);
    const modifiers =
        items.length > 0
            ? await dbAll<OrderItemModifierRow>(db, QUERIES.GET.ORDER_ITEM_MODIFIERS, [items.map(item => item.id)])
            : [];

    const itemsByOrder = groupBy(items, item => item.order_id);
    const modifiersByItem = groupBy(modifiers, modifier => modifier.order_item_id);

    return orders.map(order => ({
        ...order,
        items: (itemsByOrder.get(order.id) ?? []).map(
            (item): OrderItemResponse => ({ ...item, modifiers: modifiersByItem.get(item.id) ?? [] })
        ),
    }));
};

const assertBranchExists = async (db: Db, branchId: string): Promise<void> => {
    await getRequiredRow<BranchRow>(db, QUERIES.GET.BRANCH_BY_ID, branchId, "branch");
};

// ========================================

const getActiveOrders = async (req: Request<BranchParams>, res: Response<OrdersResponse>): Promise<void> => {
    const { branchId } = req.params;

    await assertBranchExists(sql, branchId);

    const orders = await dbAll<OrderRow>(sql, QUERIES.GET.ACTIVE_ORDERS, [branchId, ACTIVE_STATUSES]);

    res.json({ orders: await attachItems(sql, orders) });
};

// ========================================

// every order (any status) from the last 30 days, newest first
const getOrderHistory = async (req: Request<BranchParams>, res: Response<OrdersResponse>): Promise<void> => {
    const { branchId } = req.params;

    await assertBranchExists(sql, branchId);

    const orders = await dbAll<OrderRow>(sql, QUERIES.GET.ORDER_HISTORY, [branchId]);

    res.json({ orders: await attachItems(sql, orders) });
};

// ========================================
// CREATE
// ========================================

type PricedModifier = { id: string; name: string; price: number };

type PricedItem = {
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
    notes: string | null;
    modifiers: PricedModifier[];
};

// checks a product's selected modifiers against its attached groups (membership + min/max) and returns them
const resolveModifiers = (
    productName: string,
    selectedIds: readonly string[],
    groups: readonly OrderPricingGroupRow[],
    available: readonly OrderPricingModifierRow[]
): PricedModifier[] => {
    const availableById = new Map(available.map(modifier => [modifier.id, modifier]));
    const selected = selectedIds.map(modifierId => {
        const modifier = availableById.get(modifierId);
        if (!modifier) throw badRequest(`Modifier ${modifierId} is not available for '${productName}'`);
        return modifier;
    });

    for (const group of groups) {
        const hasChoices = available.some(modifier => modifier.modifier_group_id === group.id);
        const count = selected.filter(modifier => modifier.modifier_group_id === group.id).length;
        const minimum = hasChoices && group.required ? Math.max(group.min_selections, 1) : group.min_selections;

        if (count < minimum) throw badRequest(`'${productName}' needs at least ${minimum} from '${group.name}'`);
        if (count > group.max_selections) {
            throw badRequest(`'${productName}' allows at most ${group.max_selections} from '${group.name}'`);
        }
    }

    return selected.map(({ id, name, price }) => ({ id, name, price }));
};

// every price comes from the database (branch override first), nothing price-related is trusted from the client
const priceItems = async (db: Db, data: OrderCreate): Promise<PricedItem[]> => {
    const productIds = unique(data.items.map(item => item.product_id));

    const [products, groups, modifiers] = await Promise.all([
        dbAll<OrderPricingProductRow>(db, QUERIES.GET.ORDER_PRICING_PRODUCTS, [data.branch_id, productIds]),
        dbAll<OrderPricingGroupRow>(db, QUERIES.GET.ORDER_PRICING_GROUPS, [productIds]),
        dbAll<OrderPricingModifierRow>(db, QUERIES.GET.ORDER_PRICING_MODIFIERS, [productIds]),
    ]);

    const productsById = new Map(products.map(product => [product.id, product]));
    const groupsByProduct = groupBy(groups, group => group.product_id);
    const modifiersByProduct = groupBy(modifiers, modifier => modifier.product_id);

    return data.items.map(item => {
        const product = productsById.get(item.product_id);
        if (!product) throw notFound(`product ${item.product_id} not found`);

        if (!product.active || product.branch_active === false) {
            throw badRequest(`'${product.name}' is not available at this branch`);
        }

        if (new Set(item.modifier_ids).size !== item.modifier_ids.length) {
            throw badRequest(`Duplicate modifiers selected for '${product.name}'`);
        }

        const itemModifiers = resolveModifiers(
            product.name,
            item.modifier_ids,
            groupsByProduct.get(item.product_id) ?? [],
            modifiersByProduct.get(item.product_id) ?? []
        );

        const unitPrice =
            (product.price_override ?? product.price) +
            itemModifiers.reduce((sum, modifier) => sum + modifier.price, 0);

        return {
            productId: product.id,
            name: product.name,
            quantity: item.quantity,
            unitPrice,
            total: unitPrice * item.quantity,
            notes: item.notes ?? null,
            modifiers: itemModifiers,
        };
    });
};

const insertItems = async (db: Db, orderId: string, items: readonly PricedItem[]): Promise<void> => {
    for (const item of items) {
        const itemId = newId();

        await dbRun(db, QUERIES.POST.ORDER_ITEM, [
            itemId,
            orderId,
            item.productId,
            item.name,
            item.quantity,
            item.unitPrice,
            item.total,
            orNull(item.notes),
        ]);

        for (const modifier of item.modifiers) {
            await dbRun(db, QUERIES.POST.ORDER_ITEM_MODIFIER, [newId(), itemId, modifier.id, modifier.name, modifier.price]);
        }
    }
};

// ========================================

const createOrder = async (req: Request, res: Response<CreateOrderResponse>): Promise<void> => {
    const data = parseInput(orderCreateSchema, req.body);

    const created = await transaction(async tx => {
        await assertBranchExists(tx, data.branch_id);

        const items = await priceItems(tx, data);

        const subtotal = items.reduce((sum, item) => sum + item.total, 0);
        const deliveryFee = data.order_type === "DELIVERY" ? data.delivery_fee : 0;
        const total = subtotal + deliveryFee;

        // lock so two simultaneous orders on one branch can never receive the same number
        await dbRun(tx, QUERIES.POST.LOCK_BRANCH_ORDERS, [data.branch_id]);
        const next = requireRow(
            await dbGet<{ next_number: number }>(tx, QUERIES.GET.NEXT_ORDER_NUMBER, [data.branch_id]),
            "order number"
        );

        const order = requireRow(
            await dbGet<OrderRow>(tx, QUERIES.POST.ORDER, [
                newId(),
                data.branch_id,
                next.next_number,
                data.order_type,
                data.customer_name,
                orNull(data.customer_phone),
                orNull(data.customer_email),
                orNull(data.address_line1),
                orNull(data.address_line2),
                orNull(data.city),
                orNull(data.postcode),
                subtotal,
                deliveryFee,
                0,
                total,
                orNull(data.notes),
            ]),
            "order"
        );

        await insertItems(tx, order.id, items);

        if (data.payment) {
            await dbRun(tx, QUERIES.POST.PAYMENT, [
                newId(),
                order.id,
                data.payment.provider,
                orNull(data.payment.provider_payment_id),
                total,
            ]);
        }

        return order;
    });

    res.status(201).json({
        order_id: created.id,
        order_number: created.order_number,
        subtotal: created.subtotal,
        total: created.total,
        message: "Order created successfully",
    });
};

// ========================================
// UPDATE STATUS
// ========================================

const updateOrderStatus = async (req: Request, res: Response<OrderStatusResponse>): Promise<void> => {
    const data = parseInput(orderStatusUpdateSchema, req.body);

    const updated = await dbGet<OrderStatusResponse>(sql, QUERIES.PATCH.ORDER_STATUS, [data.id, data.status]);

    res.json(requireRow(updated, "order"));
};

// ========================================

export default router;
