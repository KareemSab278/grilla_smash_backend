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
        const response = {
            products,
            mealSideOptions: options.filter(x => [
                "Fries",
                "Peri Fries",
                "Onion Rings",
                "Mozzarella Sticks",
                "Chilli Cheese Bites"
            ].includes(x.name)),
            drinkOptions: options.filter(x => [
                "Coke",
                "Coke Zero",
                "Sprite",
                "Fanta",
                "Milk Shake"
            ].includes(x.name)),
            extrasByCategory: {
                burgers: options.filter(x => x.category === "burgers"),
                wraps: options.filter(x => x.category === "wraps"),
                chicken: [
                    {
                        name: "Sauce",
                        price: 0
                    }
                ],
                "loaded-fries": options.filter(x => x.category === "loaded-fries")
            },
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
