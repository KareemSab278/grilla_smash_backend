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
};


export type CreateOrderRequest = {
    branch_id: string;
    customer_name: string;
    customer_phone?: string;
    total: number;
    items: OrderItemRequest[];
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

export type OrderStatus =
    | "confirmed" | "pending"
    | "completed" | "cancelled"
    | "preparing" | "ready";




export type UpdateOrderStatusResponse = {
    id: string;
    order_status: UpdateOrderStatusRequest["status"];
};