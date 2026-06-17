import { MATCH_STATUS } from "../validation/matches.js";

/**
 * Determines the current status of a match based on its start and end times.
 * Execution Flow:
 * 1. Converts input strings/dates to native Date objects.
 * 2. Validates that the dates are not NaN (invalid dates).
 * 3. Compares the current time ('now') against start and end times.
 * 4. Returns the appropriate status enum string.
 */
export function getMatchStatus(startTime, endTime, now = new Date()) {
  // Normalize inputs to Date objects
  const start = new Date(startTime);
  const end = new Date(endTime);

  // Guard clause for invalid date parsing
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  // Chronological evaluation
  if (now < start) {
    return MATCH_STATUS.SCHEDULED;
  }

  if (now >= end) {
    return MATCH_STATUS.FINISHED;
  }

  // Fallback: If it's not before start and not after end, it must be happening now
  return MATCH_STATUS.LIVE;
}

/**
 * Syncs the match status in the database if it has changed.
 * Execution Flow:
 * 1. Calculates what the status *should* be right now.
 * 2. Returns early if the calculation fails (invalid dates).
 * 3. Compares the calculated status with the existing DB status.
 * 4. If different, triggers the update callback and mutates the local object.
 */
export async function syncMatchStatus(match, updateStatus) {
  // Calculate expected status
  const nextStatus = getMatchStatus(match.startTime, match.endTime);

  // Guard against invalid date calculations
  if (!nextStatus) {
    return match.status;
  }

  // Update only if a state change is detected (prevents unnecessary DB writes)
  if (match.status !== nextStatus) {
    await updateStatus(nextStatus); // Execute the provided DB update callback
    match.status = nextStatus;      // Mutate the local object to reflect the new state
  }
  return match.status;
}
