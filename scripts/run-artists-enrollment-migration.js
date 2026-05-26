/** Run config/database-artists-enrollment.sql (artist firstname, lastname, middle_name, carrier_name) */
import "dotenv/config";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(__dirname, "..", "config", "database-artists-enrollment.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const client = new pg.Client({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "music_app",
  password: process.env.DB_PASSWORD || "password",
  port: parseInt(process.env.DB_PORT || "5432", 10),
});

async function run() {
  try {
    await client.connect();
    await client.query(sql);
    console.log("database-artists-enrollment.sql completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
