/*
    TYPES - SHAPES OF DATABASE ROWS AND API RESPONSES.

    *Row        1:1 with a table in schema.txt (booleans are real booleans, timestamps are Date)
    *JoinRow    a row plus the id of its parent, used to batch-load children in one query
    *Response   what the API actually returns (a row plus nested children)
    Request body types are NOT here, they are inferred from the zod schemas in schemas.ts.
*/

export type SqlParam = string | number | boolean | null | readonly string[] | readonly number[];

export type OfferType = "FIXED_PRICE" | "PERCENTAGE" | "FIXED_DISCOUNT" | "BUY_X_GET_Y";

export type DeleteResponse = {
    success: true;
    deleted: string;
};

export type SuccessResponse = {
    success: true;
};

// ========================================
// ROWS (1:1 with the tables in database/schema.sql)
// ========================================

export type BusinessRow = {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    currency: string;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    // lat lon ALWAYS REQUIRED
    latitude: number;
    longitude: number;
};

export type BranchRow = {
    id: string;
    name: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    postcode: string;
    phone: string | null;
    latitude: number | null;
    longitude: number | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type CategoryRow = {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    sort_order: number;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

// price is in pence: £8.99 = 899
export type ProductRow = {
    id: string;
    name: string;
    description: string | null;
    price: number;
    image_url: string | null;
    sort_order: number;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type ModifierGroupRow = {
    id: string;
    name: string;
    required: boolean;
    min_selections: number;
    max_selections: number;
    sort_order: number;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type ModifierRow = {
    id: string;
    modifier_group_id: string;
    name: string;
    price: number;
    sort_order: number;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type BranchProductOverrideRow = {
    branch_id: string;
    product_id: string;
    active: boolean | null;
    price_override: number | null;
};

export type OfferRow = {
    id: string;
    name: string;
    description: string | null;
    type: OfferType;
    price: number | null;
    percentage: number | null;
    discount_amount: number | null;
    starts_at: Date | null;
    ends_at: Date | null;
    sort_order: number;
    active: boolean;
    created_at: Date;
    updated_at: Date;
};

export type OfferRuleRow = {
    id: string;
    offer_id: string;
    name: string;
    quantity: number;
    sort_order: number;
};

// ========================================
// JOIN ROWS (child row + the id of its parent)
// ========================================

export type ProductCategoryJoinRow = CategoryRow & { product_id: string };

export type OfferRuleProductJoinRow = ProductRow & { offer_rule_id: string };

export type OfferRuleGroupJoinRow = ModifierGroupRow & {
    offer_rule_id: string;
    offer_required: boolean;
    offer_min_selections: number;
    offer_max_selections: number;
};

export type OfferRuleModifierJoinRow = ModifierRow & { offer_rule_id: string };

// ========================================
// RESPONSES
// ========================================

export type ProductResponse = ProductRow & {
    categories: CategoryRow[];
};

export type ModifierGroupResponse = ModifierGroupRow & {
    modifiers: ModifierRow[];
};

export type BranchProductResponse = ProductRow & {
    branch_active: boolean | null;
    price_override: number | null;
    effective_price: number;
};

export type OfferRuleModifierGroupResponse = ModifierGroupRow & {
    modifiers: ModifierRow[];
};

export type OfferRuleResponse = OfferRuleRow & {
    products: ProductRow[];
    modifier_groups: OfferRuleModifierGroupResponse[];
};

export type OfferResponse = OfferRow & {
    rules: OfferRuleResponse[];
};

export type AttachModifierGroupResponse = {
    success: true;
    product_id: string;
    modifier_group_id: string;
};

// ========================================
// ORDERS
// ========================================

export type OrderType = "PICKUP" | "DELIVERY";

export type OrderStatus =   "PENDING" | "ACCEPTED" | "PREPARING" |
                            "READY" | "COMPLETED" | "CANCELLED" | "REFUNDED";

export type OrderRow = {
    id: string;
    branch_id: string;
    order_number: number;
    order_type: OrderType;
    status: OrderStatus;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postcode: string | null;
    subtotal: number;
    delivery_fee: number;
    discount: number;
    total: number;
    notes: string | null;
    created_at: Date;
    updated_at: Date;
};

// name and unit_price are snapshots taken when the order was placed
export type OrderItemRow = {
    id: string;
    order_id: string;
    product_id: string | null;
    offer_id: string | null;
    offer_rule_id: string | null;
    name: string;
    quantity: number;
    unit_price: number;
    total: number;
    notes: string | null;
};

export type OrderItemModifierRow = {
    id: string;
    order_item_id: string;
    modifier_id: string | null;
    name: string;
    price: number;
    quantity: number;
};

export type OrderItemResponse = OrderItemRow & {
    modifiers: OrderItemModifierRow[];
};

export type OrderResponse = OrderRow & {
    items: OrderItemResponse[];
};

export type OrderStatusResponse = {
    id: string;
    status: OrderStatus;
};

// ========================================
// ORDER PRICING (rows used to price + validate a new order)
// ========================================

export type OrderPricingProductRow = {
    id: string;
    name: string;
    active: boolean;
    price: number;
    branch_active: boolean | null;
    price_override: number | null;
};

export type OrderPricingGroupRow = {
    product_id: string;
    id: string;
    name: string;
    required: boolean;
    min_selections: number;
    max_selections: number;
};

export type OrderPricingModifierRow = {
    product_id: string;
    id: string;
    modifier_group_id: string;
    name: string;
    price: number;
};
