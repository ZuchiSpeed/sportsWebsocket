import "dotenv/config"; // Ensures env vars are loaded before DB initialization
import { drizzle } from "drizzle-orm/node-postgres"; // Drizzle ORM adapter optimized for the native pg driver
import pg from "pg";

// Validates critical credentials before connection setup; prevents silent runtime failures
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

// Configures a managed connection pool to handle concurrent requests efficiently
// Prevents connection exhaustion and reduces TCP handshake overhead under load
// In production, tune max/idleTimeout via environment variables if scaling beyond default
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initializes Drizzle ORM bound to the connection pool
// Exported as a singleton to ensure consistent transaction handling and query execution across the app
export const db = drizzle(pool);
