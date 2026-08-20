"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const queries_1 = require("./queries");
const db_1 = __importDefault(require("./db"));
const CUSTOMER_DATA_PURGE_AGE_MS = 72 * 60 * 60 * 1000;
const CUSTOMER_DATA_PURGE_MIN_INTERVAL_MS = 12 * 60 * 60 * 1000;
const CUSTOMER_DATA_PURGE_LOOP_DELAY_MS = 3 * 60 * 60 * 1000;
let lastCustomerDataPurgeAt = 0;
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const purgeStaleCustomerData = async () => {
    const now = Date.now();
    if (now - lastCustomerDataPurgeAt < CUSTOMER_DATA_PURGE_MIN_INTERVAL_MS) {
        return 0;
    }
    try {
        const updatedRows = await db_1.default.unsafe(queries_1.QUERIES.PATCH.PURGE_OLD_CUSTOMER_DATA);
        lastCustomerDataPurgeAt = now;
        const count = updatedRows[0]?.updated_count || 0;
        console.log(`Customer data purge completed. Updated ${count} order(s).`);
        return count;
    }
    catch (error) {
        console.error("Customer data purge failed:", error);
        throw error;
    }
};
const startCustomerDataPurgeLoop = async () => {
    try {
        await purgeStaleCustomerData();
    }
    catch (error) {
        console.error("Initial customer data purge failed:", error);
    }
    while (true) {
        await delay(CUSTOMER_DATA_PURGE_LOOP_DELAY_MS);
        try {
            await purgeStaleCustomerData();
        }
        catch (error) {
            console.error("Customer data purge failed:", error);
        }
    }
};
exports.default = startCustomerDataPurgeLoop;
