/**
 * @fileoverview Express router for handling match commentary endpoints.
 *
 * This module manages the retrieval and creation of commentary events
 * for specific matches. It integrates with the database via Drizzle ORM
 * and triggers real-time WebSocket broadcasts when new commentary is added.
 *
 * Expected parent route structure: /matches/:matchId/commentary
 */

import { Router } from "express";
import {
  createCommentarySchema,
  listCommentaryQuerySchema,
} from "../src/validation/commentary.js";
import { matchIdParamSchema } from "../src/validation/matches.js";
import { db } from "../src/db/db.js";
import { commentary } from "../src/db/schema.js";
import { desc, eq } from "drizzle-orm";

// Hard cap on pagination limit to prevent database overload (DoS protection)
const MAX_LIMIT = 100;

// mergeParams: true is required here so we can access the `:matchId` parameter
// defined in the parent route (e.g., /matches/:matchId)
export const commentaryRouter = Router({ mergeParams: true }); // Merge params to access match ID from parent route

/**
 * GET /
 * Retrieves a paginated list of commentary events for a specific match.
 * Results are ordered by creation time (newest first).
 *
 * @route GET /matches/:matchId/commentary
 * @param {string} req.params.matchId - The ID of the match.
 * @param {number} [req.query.limit=10] - Number of records to return (max 100).
 * @returns {200} JSON object containing an array of commentary data.
 * @returns {400} If URL params or query validation fails.
 * @returns {500} If a database error occurs.
 */

commentaryRouter.get("/", async (req, res) => {
  // Validate URL parameters (ensures matchId exists and is correctly formatted)
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramsResult.error.issues });
  }

  // Validate query parameters (ensures limit is a valid number if provided)
  const queryResult = listCommentaryQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: "Invalid query parameters.",
      details: queryResult.error.issues,
    });
  }

  try {
    const { id: matchId } = paramsResult.data;
    const { limit = 10 } = queryResult.data;

    // Cap the limit to our maximum allowed threshold
    const safeLimit = Math.min(limit, MAX_LIMIT);

    // Fetch from DB: Filter by matchId, sort newest-first, apply limit
    const results = await db
      .select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt))
      .limit(safeLimit);

    res.status(200).json({ data: results });
  } catch (error) {
    console.error("Failed to fetch commentary:", error);
    res.status(500).json({ error: "Failed to fetch commentary." });
  }
});

/**
 * POST /
 * Creates a new commentary event for a specific match.
 * Upon successful database insertion, it triggers a WebSocket broadcast
 * to notify connected clients of the new event in real-time.
 *
 * @route POST /matches/:matchId/commentary
 * @param {string} req.params.matchId - The ID of the match.
 * @param {Object} req.body - The commentary payload (validated by createCommentarySchema).
 * @returns {201} JSON object containing the newly created commentary data.
 * @returns {400} If URL params or body validation fails.
 * @returns {500} If a database or broadcast error occurs.
 */

commentaryRouter.post("/", async (req, res) => {
  // Validate URL parameters
  const paramsResult = matchIdParamSchema.safeParse(req.params);

  if (!paramsResult.success) {
    return res
      .status(400)
      .json({ error: "Invalid match ID.", details: paramsResult.error.issues });
  }

  // Validate request body against the Zod schema
  const bodyResult = createCommentarySchema.safeParse(req.body);

  if (!bodyResult.success) {
    return res.status(400).json({
      error: "Invalid commentary payload.",
      details: bodyResult.error.issues,
    });
  }

  try {
    // Destructure minute to ensure it's explicitly passed,
    // while grouping the rest of the schema-validated fields
    const { minute, ...rest } = bodyResult.data;

    // Insert into DB and return the newly created row
    const [result] = await db
      .insert(commentary)
      .values({
        matchId: paramsResult.data.id,
        minute,
        ...rest,
      })
      .returning();

    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(result.matchId, result);
    }

    // 3. Real-time WebSocket Integration
    // Check if the broadcast function is registered in Express app locals.
    // This allows the router to remain decoupled from the specific WebSocket implementation.
    if (res.app.locals.broadcastCommentary) {
      res.app.locals.broadcastCommentary(result.matchId, result);
    }

    res.status(201).json({ data: result });
  } catch (error) {
    console.error("Failed to create commentary:", error);
    res.status(500).json({ error: "Failed to create commentary." });
  }
});
