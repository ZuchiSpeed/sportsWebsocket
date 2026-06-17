import { z } from "zod";

/**
 * Schema for querying commentary.
 * Execution: Coerces the 'limit' string from the URL query into a positive integer,
 * capping it at 100 to prevent abuse.
 */
export const listCommentaryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Schema for creating a new commentary event.
 * Execution: Validates the payload structure. 'message' is strictly required (min length 1).
 * All other fields are optional to allow flexibility for different types of events
 * (e.g., goals, cards, substitutions, or generic text).
 */
export const createCommentarySchema = z.object({
  minute: z.number().int().nonnegative(),
  sequence: z.number().int().optional(),
  period: z.string().optional(),
  eventType: z.string().optional(),
  actor: z.string().optional(),
  team: z.string().optional(),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).optional(),
});
