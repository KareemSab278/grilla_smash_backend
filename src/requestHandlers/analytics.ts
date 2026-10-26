import express from "express";
import type { Request, RequestHandler, Response } from "express";
import sql, { dbAll } from "../database/db";
import type { Db } from "../database/db";
import { getRequiredRow } from "../helpers/helpers";
import { requireBusinessKey } from "../middleware/requireBusinessKey";
import { QUERIES } from "../queries/queries";
import {
    AnalyticsCache, analyticsRange, categorySales, peakSeries, refundedOrderSeries,
} from "../analytics/analytics";
import type { AnalyticsRange, CategoryProduct, PeakRow, ProductSales, RefundedOrderDay } from "../analytics/analytics";
import type { SqlParam } from "../types";

type Params = { branchId: string };
type Context = { branchId: string | null; range: AnalyticsRange; params: readonly SqlParam[] };
type SalesRow = {
    day: string; order_count: number; subtotal: number; discount: number; delivery_fee: number; total: number;
};
type OrderRow = { status: string; order_type: string; order_count: number };
type OfferRow = { offer_id: string | null; name: string; offer_lines: number; discount: number };
type ModifierRow = { modifier_id: string | null; name: string; quantity: number; item_value: number };
type DeliveryRow = { postcode_area: string; order_count: number; total: number; delivery_fee: number };
type BranchRow = { id: string; name: string; active: boolean; order_count: number; total: number };
type Loader = (context: Context) => Promise<object>;

export const createAnalyticsRouter = (db: Db = sql, authenticate: RequestHandler = requireBusinessKey) => {
    const router = express.Router();
    const cache = new AnalyticsCache<object>(120_000, 128);
    const branchCache = new AnalyticsCache<void>(120_000, 128);
    const categoryCache = new AnalyticsCache<CategoryProduct[]>(120_000, 1);

    const sales: Loader = async ({ params }) => {
        const days = await dbAll<SalesRow>(db, QUERIES.ANALYTICS.SALES, params);
        const summary = days.reduce(
            (sum, day) => ({
                order_count: sum.order_count + day.order_count,
                subtotal: sum.subtotal + day.subtotal,
                discount: sum.discount + day.discount,
                delivery_fee: sum.delivery_fee + day.delivery_fee,
                total: sum.total + day.total,
            }),
            { order_count: 0, subtotal: 0, discount: 0, delivery_fee: 0, total: 0 }
        );
        return {
            summary: { ...summary, average_order_value: summary.order_count ? Math.round(summary.total / summary.order_count) : 0 },
            days: days.map(day => ({
                ...day, average_order_value: Math.round(day.total / day.order_count),
            })),
        };
    };

    const orders: Loader = async ({ params }) => {
        const rows = await dbAll<OrderRow>(db, QUERIES.ANALYTICS.ORDERS, params);
        const statuses = new Map<string, number>();
        const types = new Map<string, number>([["PICKUP", 0], ["DELIVERY", 0]]);
        for (const row of rows) {
            statuses.set(row.status, (statuses.get(row.status) ?? 0) + row.order_count);
            if (row.status === "COMPLETED" || row.status === "COMPLETED (PARTIAL REFUND)") {
                types.set(row.order_type, (types.get(row.order_type) ?? 0) + row.order_count);
            }
        }
        return {
            by_status: [...statuses].map(([status, order_count]) => ({ status, order_count })),
            by_type: [...types].map(([order_type, order_count]) => ({ order_type, order_count })),
        };
    };
    const refunds: Loader = async ({ params }) =>
        refundedOrderSeries(await dbAll<RefundedOrderDay>(db, QUERIES.ANALYTICS.REFUNDS, params));

    const peaks: Loader = async ({ params }) => peakSeries(await dbAll<PeakRow>(db, QUERIES.ANALYTICS.PEAKS, params));

    const products: Loader = async ({ params }) => {
        const [items, categories] = await Promise.all([
            dbAll<ProductSales>(db, QUERIES.ANALYTICS.PRODUCTS, params),
            categoryCache.get("categories", () => dbAll<CategoryProduct>(db, QUERIES.ANALYTICS.CATEGORY_PRODUCTS)),
        ]);
        return { products: items, categories: categorySales(items, categories) };
    };

    const offers: Loader = async ({ params }) => ({
        offers: await dbAll<OfferRow>(db, QUERIES.ANALYTICS.OFFERS, params),
    });

    const modifiers: Loader = async ({ params }) => ({
        modifiers: await dbAll<ModifierRow>(db, QUERIES.ANALYTICS.MODIFIERS, params),
    });

    const delivery: Loader = async ({ params }) => ({
        areas: await dbAll<DeliveryRow>(db, QUERIES.ANALYTICS.DELIVERY, params),
    });

    const branches: Loader = async ({ params }) => ({
        branches: await dbAll<BranchRow>(db, QUERIES.ANALYTICS.BRANCHES, params),
    });

    const respond = async (req: Request, res: Response, endpoint: string, branchId: string | null, load: Loader) => {
        const range = analyticsRange(req.query);
        const key = JSON.stringify([endpoint, branchId, range.from, range.to]);
        const data = await cache.get(key, async () => {
            if (branchId !== null) {
                await branchCache.get(branchId, async () => {
                    await getRequiredRow<{ id: string }>(db, QUERIES.ANALYTICS.BRANCH_EXISTS, branchId, "branch");
                });
            }
            const params: readonly SqlParam[] = [branchId, range.from, range.to];
            return {
                branch_id: branchId,
                range,
                timezone: "Europe/London",
                generated_at: new Date().toISOString(),
                ...(await load({ branchId, range, params })),
            };
        });
        res.set("Cache-Control", "private, no-store");
        res.json(data);
    };

    router.use("/analytics", authenticate);
    router.get("/analytics/branches", async (req, res) => await respond(req, res, "branches", null, branches));

    const branchRoute = (path: string, load: Loader, cacheKey = path) => {
        router.get<Params>(`/analytics/${path}/:branchId`, async (req, res) => {
            const branchId = req.params.branchId === "all" ? null : req.params.branchId;
            await respond(req, res, cacheKey, branchId, load);
        });
    };

    branchRoute("sales", sales);
    branchRoute("orders", orders);
    branchRoute("refunds", refunds);
    branchRoute("peak-times", peaks);
    branchRoute("products", products);
    branchRoute("categories", products, "products");
    branchRoute("offers", offers);
    branchRoute("modifiers", modifiers);
    branchRoute("delivery", delivery);

    return router;
};

export default createAnalyticsRouter();
