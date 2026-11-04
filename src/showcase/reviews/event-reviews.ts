// Pure event-review validation (P4). Shared by the review form and any
// server path so both enforce the same rules. Attendance and timing are
// enforced again by the database RLS write gate — this only checks shape.
import { z } from "zod";

export const REVIEW_BODY_MAX = 1000;

export const reviewSchema = z.object({
  eventId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(REVIEW_BODY_MAX),
});

export type ReviewInput = z.infer<typeof reviewSchema>;

export type ValidatedReview =
  | { ok: true; value: ReviewInput }
  | { ok: false; error: string };

/** Validates raw form input into friendly, field-specific messages. */
export function validateReview(input: { eventId: string; rating: number; body: string }): ValidatedReview {
  const parsed = reviewSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const first = parsed.error.issues[0];
  if (first?.path[0] === "rating") {
    return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  }
  if (first?.path[0] === "body") {
    return { ok: false, error: `Keep your review under ${REVIEW_BODY_MAX} characters.` };
  }
  return { ok: false, error: "That review needs a second look." };
}

/** Average of stored ratings to one decimal; null when there are none. */
export function averageRating(ratings: number[]): number | null {
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return Math.round((sum / ratings.length) * 10) / 10;
}
