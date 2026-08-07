"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const queries_1 = require("../queries");
const db_1 = __importDefault(require("../db"));
const router = express_1.default.Router();
router.get("/menu", async (req, res) => {
    try {
        const products = await db_1.default.unsafe(queries_1.QUERIES.GET.PRODUCTS);
        const options = await db_1.default.unsafe(queries_1.QUERIES.GET.EXTRAS);
        const meals = await db_1.default.unsafe(queries_1.QUERIES.GET.MEALS);
        const sides = await db_1.default.unsafe(queries_1.QUERIES.GET.MEAL_SIDES);
        const drinks = await db_1.default.unsafe(queries_1.QUERIES.GET.MEAL_DRINKS);
        const response = {
            products,
            mealSideOptions: sides,
            drinkOptions: drinks,
            extrasByCategory: options.reduce((acc, option) => {
                const cat = option.category;
                if (!cat)
                    return acc;
                if (!acc[cat])
                    acc[cat] = [];
                acc[cat].push(option);
                return acc;
            }, {}),
            mealOptions: meals.map(meal => ({
                name: meal.name,
                price: meal.price
            }))
        };
        res.json(response);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({
            error: err.message
        });
    }
});
exports.default = router;
