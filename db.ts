import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL missing");
} else {
    console.log("DATABASE_URL found");
}


const sql = postgres(connectionString);

export default sql;