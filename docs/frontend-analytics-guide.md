# Analytics API for the frontend

The analytics API returns aggregated order data for charts. All endpoints are `GET` and require
`X-Business-Key`. This is a secret: call these endpoints from a trusted server or backend-for-frontend;
do not embed the key in browser or mobile application code. There is no per-branch role enforcement.

## Common request and response rules

- All endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD`, with both dates required together and inclusive.
  The maximum range is 366 calendar days. Omit both for **year to date** in `Europe/London`.
- For a previous calendar year, for example, use `?from=2025-01-01&to=2025-12-31`. The London
  timezone, including daylight saving, determines both date boundaries and hour/day buckets.
- For endpoints with `:branchId`, pass an actual branch ID or `all` for all branches. Unknown branches
  return 404. `/analytics/branches` always compares all branches.
- Monetary values are integers in the business currency's **minor units** (pence for GBP). Use the
  currency from the business endpoint when displaying them. Counts and quantities are numbers.
- Each response includes `branch_id` (null means all branches), `range: { from, to }`, `timezone`,
  and `generated_at`. Examples below shorten arrays where noted.
- Data is cached per backend instance for two minutes after a successful query, with concurrent
  identical requests coalesced. Branch-existence checks and category mappings have their own
  two-minute caches shared across reports. A report generated just before one of those caches
  expires may therefore reflect branch or category changes up to four minutes late.
  `generated_at` indicates when the report was generated, not necessarily when its cached
  category mapping was loaded. HTTP responses are marked `private, no-store`.
- Invalid dates, partial ranges, ranges longer than 366 days and unknown query parameters return
  422 with `{ "detail": "..." }`; a missing or invalid business key returns 401.

**Sales definition:** Sales, product, category, offer, modifier, delivery, branch and peak-time
reports use orders currently marked `COMPLETED`, including `COMPLETED - refund ...` partial-refund
statuses. Amounts for partially refunded orders remain **gross order values**, without subtracting
refunds; fully refunded orders, cancelled orders and other statuses are excluded. This is not
verified revenue, net revenue or profit: payment verification and a complete refund ledger do not
exist here. Dates and peak-time buckets use when the order was **created**, not when it was
completed. Status changes can therefore alter past reports. Order-status charts are the exception:
they include every current status.

```sh
curl 'https://example.com/analytics/sales/BRANCH_ID?from=2026-01-01&to=2026-10-26' \
  -H 'X-Business-Key: YOUR_BUSINESS_KEY'
```

## Chart and endpoint summary

| Endpoint | Recommended charts |
|---|---|
| `/analytics/sales/:branchId` | Daily sales line; total sales, completed orders and average-order-value cards; weekly/monthly sales and average-order-value lines derived from daily data |
| `/analytics/orders/:branchId` | Delivery vs pickup donut; current-status bar chart |
| `/analytics/refunds/:branchId` | Refunded-order count or order value by day as a line or bar chart; summary cards for both totals |
| `/analytics/peak-times/:branchId` | Weekday/hour heatmap; hourly and weekday bar charts; monthly/hour heatmap to compare peak hours throughout a year |
| `/analytics/products/:branchId` | All product quantities and item values as sortable bar charts; all category quantities and item values as sortable bar charts |
| `/analytics/categories/:branchId` | Alias of the products endpoint, returning the same products and categories data |
| `/analytics/offers/:branchId` | Offer lines and discounts as bar charts |
| `/analytics/modifiers/:branchId` | Modifier quantity and item value as bar charts |
| `/analytics/delivery/:branchId` | Delivery count and order value by postcode area as bar charts, or an area map if the frontend has postcode-area boundaries |
| `/analytics/branches` | Branch order counts and order values as grouped bar charts |

## Sales

`GET /analytics/sales/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-02" },
  "timezone": "Europe/London",
  "generated_at": "2026-01-03T12:00:00.000Z",
  "summary": {
    "order_count": 2, "subtotal": 2000, "discount": 200,
    "delivery_fee": 100, "total": 1900, "average_order_value": 950
  },
  "days": [
    {
      "day": "2026-01-01", "order_count": 2, "subtotal": 2000, "discount": 200,
      "delivery_fee": 100, "total": 1900, "average_order_value": 950
    }
  ]
}
```

`total = subtotal - discount + delivery_fee`. `average_order_value` is total divided by order count,
rounded to the nearest minor unit. Days without completed orders are omitted: fill them with zero
on the chart. To aggregate weeks or months, sum daily totals and counts, then divide the sums to
calculate the average; do not average the daily averages.

## Orders and status

`GET /analytics/orders/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-02" },
  "timezone": "Europe/London",
  "generated_at": "2026-01-03T12:00:00.000Z",
  "by_status": [
    { "status": "CANCELLED", "order_count": 1 },
    { "status": "COMPLETED", "order_count": 2 },
    { "status": "COMPLETED (PARTIAL REFUND)", "order_count": 1 }
  ],
  "by_type": [
    { "order_type": "PICKUP", "order_count": 2 },
    { "order_type": "DELIVERY", "order_count": 1 }
  ]
}
```

`by_status` includes all orders based on their current status, including partial-refund labels;
statuses with zero orders are omitted. `by_type` includes completed orders only, and always
includes both types, even when their counts are zero.

## Refunded orders

`GET /analytics/refunds/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "date_basis": "order_created",
  "value_basis": "order_total",
  "summary": { "refund_count": 2, "total": 2500 },
  "refunds": [
    { "day": "2026-01-10", "refund_count": 1, "total": 1500 },
    { "day": "2026-01-20", "refund_count": 1, "total": 1000 }
  ]
}
```

Use a line or bar chart with `day` on the horizontal axis and `refund_count` or `total` on the
vertical axis. Label the chart **"Refunded orders by order creation date"** and label `total`
**"Refunded order value"**. Fill missing days with zero; an empty period returns an empty
`refunds` array and zero summary values.

This counts orders **currently** marked exactly `REFUNDED`, grouped by when the order was
created—not when it was refunded. Partial-refund statuses are excluded. The value is the sum of
those orders' original `total` fields, not the amount refunded in the period. A refund that
happens later can change a past period's chart. The database does not store a complete, dated
refund-event history, so this report must not be presented as actual refunded amounts or net
revenue.

## Peak times

`GET /analytics/peak-times/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "by_weekday": [{ "weekday": 1, "order_count": 5 }],
  "by_hour": [{ "hour": 0, "order_count": 2 }],
  "heatmap": [{ "weekday": 1, "hour": 0, "order_count": 1 }],
  "by_month": [
    { "month": "2026-01", "order_count": 5, "by_hour": [{ "hour": 0, "order_count": 2 }] }
  ]
}
```

Arrays are shortened in this example: `by_weekday` always has 7 rows (Monday = 1, Sunday = 7),
`by_hour` has 24 (0–23), and `heatmap` has 168. They include zero buckets. `by_month` includes
months with orders, each with 24 hourly buckets; fill omitted months with zero. For a year or
year-to-date range, the month/hour chart shows how peaks change across the period. A month at a
range boundary may be partial. Daylight-saving repeated hours are combined.

## Products and categories

`GET /analytics/products/:branchId` or `GET /analytics/categories/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "products": [
    { "id": "p1", "name": "Burger", "active": true, "quantity": 3, "item_value": 2700 },
    { "id": "p2", "name": "Fries", "active": false, "quantity": 0, "item_value": 0 }
  ],
  "categories": [
    { "id": "c1", "name": "Food", "active": true, "quantity": 3, "item_value": 2700 },
    { "id": "c2", "name": "Drinks", "active": true, "quantity": 0, "item_value": 0 }
  ]
}
```

Both aliases return the same response and share the cache. All current products and categories,
including inactive and zero-sale entries, are returned; the frontend can sort ascending or
descending without a separate best/worst endpoint. Quantity includes free offer items.
`item_value` is the sum of stored item totals **before order-level offer discounts**, including
modifier prices and excluding delivery fees. It is not net sales and will not necessarily add up
to order totals.

Categories use the **current** product-category assignments, not a historical snapshot. A
product in multiple categories is counted in each, so category totals can overlap. Products
without a category do not contribute to category totals; items without a product ID are omitted.
Names and active flags are current menu data, whereas item values come from order snapshots.

## Offers

`GET /analytics/offers/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "offers": [{ "offer_id": "o1", "name": "Meal deal", "offer_lines": 2, "discount": 400 }]
}
```

Only recorded bundle offers are included. `offer_lines` counts stored offer rows, **not bundle
units or distinct orders**; a row may represent multiple bundles. Automatic buy-X-get-Y free
items are not recorded in this table and are not included. `name` is the order-time snapshot, so
renames can appear as separate entries; `offer_id` may be null. Unused offers are omitted.

## Modifiers

`GET /analytics/modifiers/:branchId`

```json
{
  "branch_id": "b1",
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "modifiers": [{ "modifier_id": "m1", "name": "Cheese", "quantity": 3, "item_value": 150 }]
}
```

Quantity includes the parent item quantity. `item_value` is the modifier's snapshot price times
quantity, before order-level discounts; it is already included in product item values and should
not be added to them. Names are order-time snapshots, IDs may be null, and unused modifiers are omitted.

## Delivery areas

`GET /analytics/delivery/:branchId`

```json
{
  "branch_id": null,
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "areas": [{ "postcode_area": "SW1A", "order_count": 3, "total": 2900, "delivery_fee": 300 }]
}
```

Only the UK outward postcode code is returned, not full postcodes or addresses. Missing, invalid
and non-UK postcodes appear as `Unknown`. `total` is order value including the delivery fee.
Locations for a map are not supplied by this endpoint; the frontend needs an appropriate
postcode-area boundary dataset. Treat even aggregates as sensitive business/customer data.

## Branch comparison

`GET /analytics/branches`

```json
{
  "branch_id": null,
  "range": { "from": "2026-01-01", "to": "2026-01-31" },
  "timezone": "Europe/London",
  "generated_at": "2026-02-01T12:00:00.000Z",
  "branches": [
    { "id": "b1", "name": "Central", "active": true, "order_count": 3, "total": 2900 },
    { "id": "b2", "name": "North", "active": false, "order_count": 0, "total": 0 }
  ]
}
```

All current branches are included, even if inactive or without sales in the period. Names and
active flags are current branch data.

## Database setup and compute

Apply [the analytics index migration](../migrations/20261026_analytics_indexes.sql) before using
these endpoints on an existing database. It uses `CREATE INDEX CONCURRENTLY` to avoid blocking
normal writes: run each statement separately in autocommit mode, outside a transaction. If an
index build is interrupted, inspect for an invalid index and remove it before retrying.

Every report filters by an indexed date range before aggregation and returns grouped rows rather
than raw customer orders. Branch reports also filter on branch ID. Product/category charts share
one order-item aggregation; each other chart makes one report query, plus business-key checks.
Branch validation and product category mappings are cached across reports. The bounded caches
reduce repeat work, but a first request per report and period still runs a query. Index builds
consume resources and add write/storage
overhead. Test representative queries with `EXPLAIN (ANALYZE, BUFFERS)` on an appropriate
staging dataset before enabling frequent dashboard refreshes; this design cannot guarantee a
particular CPU cost on an unknown dataset. Longer-term rollups can be added if needed.
