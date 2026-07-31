export type MenuProduct = {
    id: number;
    name: string;
    category: string;
    price: number;
    description: string;
    image: string;
    popular: boolean;
};


export type MenuOption = {
    id: number;
    name: string;
    price: number;
    is_protein?: boolean;
    category?: string;
};


export type MenuResponse = {
    products: MenuProduct[];

    mealSideOptions: {
        name: string;
        price: number;
    }[];

    drinkOptions: {
        name: string;
        price: number;
    }[];

    extrasByCategory: {
        burgers: MenuOption[];
        wraps: MenuOption[];
        chicken: {
            name: string;
            price: number;
        }[];
        "loaded-fries": MenuOption[];
    };

    mealOptions: {
        name: string;
        price: number;
    }[];
};


export type OrderItemRequest = {
    product_id: number;
    quantity: number;
    price: number;
    extras?: { id: number; price: number }[];
    sauce_choice?: string;
    notes?: string;
    meal?: MealSelection | null;
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
    items: OrderItemRequest[];
    payment_id: string;
};


export type OrderItemOption = {
    option_id: number;
    name: string;
    price: number;
};


export type OrderItem = {
    product_id: number;
    product_name: string;
    quantity: number;
    price: number;
    sauce_choice: string | null;
    notes: string | null;
    meal: {
        drink_id: number;
        drink_name: string;
        side_id: number;
        side_name: string;
    } | null;
    options: OrderItemOption[] | null;
};


export type UpdateOrderStatusRequest = {
    id: string;
    status: OrderStatus;
};

export type Order = {
    id: string;
    customer_name: string;
    customer_phone?: string;
    order_status: OrderStatus;
    total: number;
    created_at: string;
    items: OrderItem[];
};

export type OrdersResponse = {
    orders: Order[];
};

export type OrderStatus = "received" | "preparing" | "ready" | "delivered" | "completed" | "refunded" | "cancelled";

export type UpdateOrderStatusResponse = {
    id: string;
    order_status: UpdateOrderStatusRequest["status"];
};

export type Product = {
    id: number;
    price?: number;
};

export type Branch = {
    id: string;
    name: string;
    location: string;
    latitude: number;
    longitude: number;
};

export type Extra = {
    id?: number;
    name?: string;
    price?: number;
};

export type MealOption = {
    id: number;
    name: string;
    price: number;
};

export type MealSelection = {
    drink: MealOption;
    side: MealOption;
};

export type customerInfo = {
    fullName: string;
    phone: string;
    email: string;
    address1: string;
    address2?: string;
    city: string;
    postcode: string;
};

export type CartItem = {
    id: number;
    product: Product;
    quantity: number;
    extras?: Extra[];
    meal?: MealSelection | null;
    sauceChoice?: string;
    notes?: string;
};

export type orderData = {
    items: CartItem[];
    total: number;
    delivery: number;
    subtotal: number;
    isPickup: boolean;
    customer: customerInfo;
    storeId: number;
    status: OrderStatus;
};

export type KdsOrderPayload = {
    UID: string;
    TEL: string;
    orderData: orderData;
    paymentId?: string;
};

export type orderResponse = {
    order_id: string;
    message: string;
};