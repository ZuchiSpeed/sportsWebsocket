import { Router } from "express";
import {
  createMatchSchema,
  listMatchesQuerySchema,
} from "../src/validation/matches.js";
import { db } from "../src/db/db.js";
import { matches } from "../src/db/schema.js";
import { getMatchStatus } from "../src/utils/match-status.js";
import { desc } from "drizzle-orm";

export const matchRouter = Router();

// Define a hard ceiling for pagination to prevent database overload
const MAX_LIMIT = 100;

/**
 * GET /matches
 * Execution Flow:
 * 1. Validates incoming query parameters against listMatchesQuerySchema.
 * 2. If invalid, immediately returns a 400 Bad Request with Zod error details.
 * 3. Calculates the limit, defaulting to 50 but capping at MAX_LIMIT (100).
 * 4. Queries the database for matches, ordered by creation date (newest first).
 * 5. Returns the data array, or a 500 Internal Server Error if the DB query fails.
 */
matchRouter.get("/", async (req, res) => {
  // Validate query parameters safely (does not throw on failure)
  const parsed = listMatchesQuerySchema.safeParse(req.query);

  // Handle validation failure
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "iNVALID QUERY.", details: parsed.error.issues });
  }

   // Determine safe limit (fallback to 50, max out at 100)
  const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);

  try {
    // Execute DB query and handle response/errors
    const data = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(limit);

    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: "Failed to list matches" });
  }
});

/**
 * POST /matches
 * Execution Flow:
 * 1. Validates the request body against createMatchSchema.
 * 2. Returns 400 if validation fails.
 * 3. Destructures validated data for clarity.
 * 4. Transforms string dates to Date objects and defaults scores to 0.
 * 5. Dynamically calculates the initial match status based on current time.
 * 6. Inserts the record into the database and returns the created row.
 */
matchRouter.post("/", async (req, res) => {
  // Validate request payload
  const parsed = createMatchSchema.safeParse(req.body);

  // Handle validation failure
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.issues,
    });
  }

  // Step 3: Extract validated data (TypeScript/Zod now guarantees this shape)
  const {
    data: { startTime, endTime, homeScore, awayScore },
  } = parsed;

   // Transform data, calculate status, and insert into DB
  try {
    const [event] = await db
      .insert(matches)
      .values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore: homeScore ?? 0,
        awayScore: awayScore ?? 0,
        status: getMatchStatus(startTime, endTime),
      })
      .returning();  // Return the newly inserted row from the database

    // Respond with 201 Created and the new match data
    res.status(201).json({ data: event });
  } catch (e) {
    res
      .status(500)
      .json({ error: "Failed to create match", details: JSON.stringify(e) });
  }
});
