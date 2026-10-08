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

export type OrderStatus =
    | "received"
    | "preparing"
    | "ready"
    | "delivered"
    | "completed"
    | "refunded"
    | "cancelled";

export type OrderItemModifierRequest = {
    id: string;
    name: string;
    price: number;
    quantity?: number;
};

export type OrderItemRequest = {
    product_id: string;
    quantity: number;
    price: number;
    sauce_choice?: string;
    notes?: string;
    modifiers?: OrderItemModifierRequest[];
};

export type CreateOrderRequest = {
    branch_id: string;
    customer_name: string;
    customer_phone?: string;
    customer_email?: string;
    customer_address1?: string;
    customer_address2?: string;
    customer_city?: string;
    customer_postcode?: string;
    is_pickup?: boolean;
    delivery_fee?: number;
    total: number;
    order_status?: OrderStatus;
    order_notes?: string;
    payment_id: string;
    items: OrderItemRequest[];
};

export type OrderItemModifier = {
    modifier_id: string | null;
    name: string;
    price: number;
    quantity: number;
};

export type OrderItem = {
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    sauce_choice: string | null;
    notes: string | null;
    modifiers: OrderItemModifier[];
};

export type Order = {
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
    items: OrderItem[];
};

export type OrdersResponse = {
    orders: Order[];
};

export type CreateOrderResponse = {
    order_id: string;
    message: string;
};

export type UpdateOrderStatusRequest = {
    id: string;
    status: OrderStatus;
};

export type UpdateOrderStatusResponse = {
    id: string;
    order_status: OrderStatus;
};
