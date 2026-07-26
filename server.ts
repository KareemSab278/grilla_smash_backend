import "dotenv/config";
import express from "express";
import cors from "cors";

import payments from "./requestHandlers/payments";
import menu from "./requestHandlers/menu";
import health from "./requestHandlers/health";
import orders from "./requestHandlers/orders";
import route from "./requestHandlers/route";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", health);
app.use("/api", payments);
app.use("/api", menu);
app.use("/api", orders);
app.use("/api", route);


app.listen(6969, () => {
    console.log("Server running on port 6969");
});
