import "dotenv/config";  // Loads .env variables into process.env at startup
import { defineConfig } from "drizzle-kit";  // Imports Drizzle's CLI configuration builder

// Fails fast if the DB connection string is missing; critical for CI/CD and containerized deployments
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set in .env file");
}

// Exports Drizzle Kit config for migration generation, schema pushes, and type generation
// This file is only consumed at build/migration time, not during runtime API execution
export default defineConfig({
  schema: "./src/db/schema.js",     // Authoritative source for table/column definitions
  out: "./drizzle",                // Directory for version-controlled migration SQL files
  dialect: "postgresql",          // Explicitly targets PostgreSQL for dialect-specific syntax & validation
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
