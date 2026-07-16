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