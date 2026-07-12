import "dotenv/config";
import express from "express";
import payments from "./payments";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/payments", payments);

app.listen(3000, () => {
    console.log("Server running on port 3000");
});