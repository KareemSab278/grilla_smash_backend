import express from "express";
import { QUERIES } from "../queries";
import sql from "../db";
import { MenuResponse, MenuProduct, MenuOption } from "../types";

const router = express.Router();

router.get("/menu", async (req, res) => {
    try {
        const products = await sql.unsafe<MenuProduct[]>(QUERIES.GET.PRODUCTS);

        const options = await sql.unsafe<MenuOption[]>(QUERIES.GET.EXTRAS);

        const meals = await sql.unsafe<{ name: string; price: number }[]>(QUERIES.GET.MEALS);

        const sides = await sql.unsafe<{ id: number; name: string; price: number }[]>(
            QUERIES.GET.MEAL_SIDES
        );

        const drinks = await sql.unsafe<{ id: number; name: string; price: number }[]>(
            QUERIES.GET.MEAL_DRINKS
        );

        const response: MenuResponse = {
            products,

            mealSideOptions: sides,

            drinkOptions: drinks,

            extrasByCategory: options.reduce((acc, option) => {
                const cat = option.category;
                if (!cat) return acc;
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(option);
                return acc;
            }, {} as Record<string, MenuOption[]>),

            mealOptions: meals.map(meal => ({
                name: meal.name,
                price: meal.price
            }))
        };

        res.json(response);

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: (err as Error).message
        });
    }
});

export default router;