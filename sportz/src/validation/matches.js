import { z } from "zod";

// Centralized enum for match states to ensure consistency across the app
export const MATCH_STATUS = {
  SCHEDULED: "scheduled",
  LIVE: "live",
  FINISHED: "finished",
};

/**
 * Query validation for listing matches.
 * Execution: Coerces URL string params to numbers, ensuring positive integers up to 100.
 */
export const listMatchesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Parameter validation for single match routes (e.g., /matches/:id).
 * Execution: Ensures the URL parameter 'id' is coerced to a positive integer.
 */
export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Payload validation for creating a new match.
 * Execution Flow:
 * 1. Validates base types (strings, ISO datetimes, optional scores).
 * 2. Runs .superRefine() AFTER base validation passes.
 * 3. In superRefine, it parses the dates and ensures chronologically that
 *    the end time occurs strictly after the start time.
 */
export const createMatchSchema = z
  .object({
    sport: z.string().min(1),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    homeScore: z.coerce.number().int().nonnegative().optional(),
    awayScore: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    // Cross-field validation
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endTime must be chronologically after startTime",
        path: ["endTime"],
      });
    }
  });

/**
 * Payload validation for updating match scores.
 * Execution: Ensures both scores are provided and are non-negative integers.
 */
export const updateScoreSchema = z.object({
  homeScore: z.coerce.number().int().nonnegative(),
  awayScore: z.coerce.number().int().nonnegative(),
});
