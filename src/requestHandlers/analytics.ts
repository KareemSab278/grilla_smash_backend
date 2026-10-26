import express from "express";
import type { Request, RequestHandler, Response } from "express";
import sql, { dbAll } from "../database/db";
import { requireRow } from "../helpers/helpers";
import { requireBusinessKey } from "../middleware/requireBusinessKey";
import { QUERIES } from "../queries/queries";
import { AnalyticsCache, analyticsRange } from "../analytics/analytics";
import type { SqlParam } from "../types";

type Params = { branchId: string };
type Amounts = { order_count: number; subtotal: number; discount: number; delivery_fee: number; total: number };
type SalesRow = {
    day: string; order_count: number; subtotal: number; discount: number; delivery_fee: number; total: number;
    average_order_value: number;
};
type SalesReport = { summary: Amounts & { average_order_value: number }; days: SalesRow[] };
type OrdersReport = {
    by_status: { status: string; order_count: number }[];
    by_type: { order_type: string; order_count: number }[];
};
type RefundsReport = { refund_count: number };
type HourCount = { hour: number; order_count: number };
type PeaksReport = {
    by_weekday: { weekday: number; order_count: number }[];
    by_hour: HourCount[];
    heatmap: { weekday: number; hour: number; order_count: number }[];
    by_month: { month: string; order_count: number; by_hour: HourCount[] }[];
};
type ItemSales = { id: string; name: string; active: boolean; quantity: number; item_value: number };
type ProductsReport = { products: ItemSales[]; categories: ItemSales[] };
type OfferRow = { offer_id: string | null; name: string; offer_lines: number; discount: number };
type ModifierRow = { modifier_id: string | null; name: string; quantity: number; item_value: number };
type DeliveryRow = { postcode_area: string; order_count: number; total: number; delivery_fee: number };
type BranchRow = { id: string; name: string; active: boolean; order_count: number; total: number };
type Loader = (params: readonly SqlParam[]) => Promise<object>;

export type AnalyticsStore = {
    all<T extends object>(query: string, params?: readonly SqlParam[]): Promise<T[]>;
};
const defaultStore: AnalyticsStore = {
    all: (query, params) => dbAll(sql, query, params),
};

export const createAnalyticsRouter = (store: AnalyticsStore = defaultStore, authenticate: RequestHandler = requireBusinessKey) => {
    const router = express.Router();
    const cache = new AnalyticsCache<object>(120_000, 128);
    const branchCache = new AnalyticsCache<void>(120_000, 128);

    const getReport = async <T extends object>(query: string, params: readonly SqlParam[]): Promise<T> => {
        const [report] = await store.all<T>(query, params);
        if (!report) throw new Error("Analytics query returned no report");
        return report;
    };

    const sales: Loader = params => getReport<SalesReport>(QUERIES.ANALYTICS.SALES, params);
    const orders: Loader = params => getReport<OrdersReport>(QUERIES.ANALYTICS.ORDERS, params);
    const refunds: Loader = params => getReport<RefundsReport>(QUERIES.ANALYTICS.REFUNDS, params);
    const peaks: Loader = params => getReport<PeaksReport>(QUERIES.ANALYTICS.PEAKS, params);
    const products: Loader = params => getReport<ProductsReport>(QUERIES.ANALYTICS.PRODUCTS, params);

    const offers: Loader = async params => ({
        offers: await store.all<OfferRow>(QUERIES.ANALYTICS.OFFERS, params),
    });

    const modifiers: Loader = async params => ({
        modifiers: await store.all<ModifierRow>(QUERIES.ANALYTICS.MODIFIERS, params),
    });

    const delivery: Loader = async params => ({
        areas: await store.all<DeliveryRow>(QUERIES.ANALYTICS.DELIVERY, params),
    });

    const branches: Loader = async params => ({
        branches: await store.all<BranchRow>(QUERIES.ANALYTICS.BRANCHES, params),
    });

    const respond = async (req: Request, res: Response, endpoint: string, branchId: string | null, load: Loader) => {
        const range = analyticsRange(req.query);
        const key = JSON.stringify([endpoint, branchId, range.from, range.to]);
        const data = await cache.get(key, async () => {
            if (branchId !== null) {
                await branchCache.get(branchId, async () => {
                    const [branch] = await store.all<{ id: string }>(QUERIES.ANALYTICS.BRANCH_EXISTS, [branchId]);
                    requireRow(branch, "branch");
                });
            }
            const params: readonly SqlParam[] = [branchId, range.from, range.to];
            return {
                branch_id: branchId,
                range,
                timezone: "Europe/London",
                generated_at: new Date().toISOString(),
                ...(await load(params)),
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
