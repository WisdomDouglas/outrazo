// Verified-attendance reviews for the event details page (P4). Reads are
// public for published events; writes go straight to Supabase where RLS
// enforces the real gates (own row, event started, RSVP or paid order).
// Reviewer names stay private (profiles are self-scoped), so every review
// shows as a verified attendee.
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { Button } from "@/design-system/components/Button";
import { supabase } from "@/integrations/supabase/external-client";
import { useAuth } from "@/showcase/auth/auth-context";
import { fetchReservation } from "@/showcase/rsvp/rsvp";
import { averageRating, REVIEW_BODY_MAX, validateReview } from "./event-reviews";

const db = supabase as unknown as SupabaseClient;

export interface EventReviewRow {
  id: string;
  userId: string;
  rating: number;
  body: string;
  createdAt: string;
}

function Stars({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-xs" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden
          className={star <= Math.round(value) ? "size-4 fill-accent text-accent" : "size-4 text-subtle-text"}
        />
      ))}
    </span>
  );
}

export function EventReviews({
  eventId,
  startsAt,
  cancelled,
}: {
  eventId: string;
  startsAt: string;
  cancelled: boolean;
}) {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [reviews, setReviews] = useState<EventReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const started = Number.isNaN(new Date(startsAt).getTime()) ? false : new Date(startsAt) <= new Date();
  const ownReview = userId ? reviews.find((row) => row.userId === userId) ?? null : null;
  const average = averageRating(reviews.map((row) => row.rating));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    db.from("event_reviews")
      .select("id,user_id,rating,body,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(
        (result: { data: unknown; error: { message: string } | null }) => {
          if (!active) return;
          if (result.error) {
            console.error("[reviews] load failed", result.error);
            setLoadError("Could not load reviews.");
            setLoading(false);
            return;
          }
          const rows = (result.data ?? []) as {
            id: string; user_id: string; rating: number; body: string; created_at: string;
          }[];
          setReviews(
            rows.map((row) => ({
              id: row.id,
              userId: row.user_id,
              rating: row.rating,
              body: row.body,
              createdAt: row.created_at,
            })),
          );
          setLoading(false);
        },
      );
    return () => {
      active = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setEligible(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const [reservation, paidOrder] = await Promise.all([
          fetchReservation(eventId, userId).catch(() => null),
          db
            .from("ticket_orders")
            .select("id")
            .eq("event_id", eventId)
            .eq("user_id", userId)
            .eq("status", "paid")
            .limit(1)
            .then((result: { data: unknown }) => result.data),
        ]);
        if (!active) return;
        const orders = (paidOrder ?? []) as { id: string }[];
        setEligible(Boolean(reservation) || orders.length > 0);
      } catch (caught) {
        console.error("[reviews] eligibility check failed", caught);
        if (active) setEligible(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [authLoading, eventId, userId]);

  useEffect(() => {
    if (ownReview) {
      setRating(ownReview.rating);
      setBody(ownReview.body);
    }
  }, [ownReview?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId || saving) return;
    setNotice(null);
    const validated = validateReview({ eventId, rating, body });
    if (!validated.ok) {
      setFormError(validated.error);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      if (ownReview) {
        const { error } = await db
          .from("event_reviews")
          .update({ rating: validated.value.rating, body: validated.value.body })
          .eq("id", ownReview.id)
          .eq("user_id", userId);
        if (error) throw error;
        setReviews((current) =>
          current.map((row) =>
            row.id === ownReview.id
              ? { ...row, rating: validated.value.rating, body: validated.value.body }
              : row,
          ),
        );
        setNotice("Review updated.");
      } else {
        const { data, error } = await db
          .from("event_reviews")
          .insert({
            event_id: eventId,
            user_id: userId,
            rating: validated.value.rating,
            body: validated.value.body,
          })
          .select("id,user_id,rating,body,created_at")
          .single();
        if (error) throw error;
        const row = data as { id: string; user_id: string; rating: number; body: string; created_at: string };
        setReviews((current) => [
          { id: row.id, userId: row.user_id, rating: row.rating, body: row.body, createdAt: row.created_at },
          ...current,
        ]);
        setNotice("Thanks — your review is live.");
      }
    } catch (caught) {
      console.error("[reviews] save failed", caught);
      setFormError(
        "Could not save your review. Reviews open to attendees after the event starts.",
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!userId || !ownReview || deleting) return;
    setDeleting(true);
    try {
      const { error } = await db
        .from("event_reviews")
        .delete()
        .eq("id", ownReview.id)
        .eq("user_id", userId);
      if (error) throw error;
      setReviews((current) => current.filter((row) => row.id !== ownReview.id));
      setRating(0);
      setBody("");
      setConfirmDelete(false);
      setNotice("Review deleted.");
    } catch (caught) {
      console.error("[reviews] delete failed", caught);
      setFormError("Could not delete your review. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const showForm = Boolean(userId) && started && !cancelled && eligible === true;

  return (
    <div className="flex flex-col gap-lg">
      {loading ? (
        <p className="type-body text-muted-text" role="status">
          Loading reviews…
        </p>
      ) : loadError ? (
        <p className="type-body text-muted-text" role="alert">
          {loadError}
        </p>
      ) : reviews.length === 0 ? (
        <p className="type-body text-muted-text">No reviews yet — be the first after you attend.</p>
      ) : (
        <>
          <p className="flex items-center gap-sm">
            <Stars value={average ?? 0} label={`Average rating ${average ?? 0} out of 5`} />
            <span className="type-body font-medium">
              {average} · {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </span>
          </p>
          <ul className="flex flex-col gap-md">
            {reviews.map((row) => (
              <li key={row.id} className="rounded-md border border-line bg-card p-md">
                <p className="flex flex-wrap items-center gap-sm">
                  <Stars value={row.rating} label={`${row.rating} out of 5 stars`} />
                  <span className="type-caption text-muted-text">Verified attendee</span>
                  <span className="type-caption text-subtle-text">
                    {new Date(row.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {ownReview?.id === row.id ? (
                    <span className="type-caption font-medium text-accent">Your review</span>
                  ) : null}
                </p>
                {row.body ? <p className="type-body mt-sm">{row.body}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {!userId && !authLoading ? (
        <p className="type-body text-muted-text">
          <Link to="/login" className="focus-ring rounded-sm text-accent">
            Sign in
          </Link>{" "}
          to leave a review after you attend.
        </p>
      ) : null}

      {userId && !started ? (
        <p className="type-body text-muted-text">Reviews open once the event starts.</p>
      ) : null}
      {userId && started && !cancelled && eligible === false ? (
        <p className="type-body text-muted-text">
          Only attendees can leave a review — RSVP or buy a ticket to share yours next time.
        </p>
      ) : null}
      {userId && cancelled ? (
        <p className="type-body text-muted-text">This event was cancelled, so reviews are closed.</p>
      ) : null}

      {showForm ? (
        <form onSubmit={submit} className="flex flex-col gap-md rounded-md border border-line bg-card p-md">
          <h3 className="type-h3">{ownReview ? "Edit your review" : "Leave a review"}</h3>
          <div className="flex flex-col gap-sm">
            <span id="review-rating-label" className="type-caption text-muted-text">
              Rating
            </span>
            <div className="flex items-center gap-xs" role="radiogroup" aria-labelledby="review-rating-label">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  role="radio"
                  aria-checked={rating === star}
                  aria-label={`${star} star${star === 1 ? "" : "s"}`}
                  onClick={() => setRating(star)}
                  className="focus-ring grid size-11 place-items-center rounded-full"
                >
                  <Star
                    aria-hidden
                    className={star <= rating ? "size-6 fill-accent text-accent" : "size-6 text-subtle-text"}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-sm">
            <label htmlFor="review-body" className="type-caption text-muted-text">
              Review (optional)
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={REVIEW_BODY_MAX}
              rows={3}
              placeholder="How was it?"
              className="type-body min-h-11 w-full rounded-md border border-line bg-canvas px-md py-sm text-primary-text outline-none placeholder:text-subtle-text focus:border-accent"
            />
          </div>
          {formError ? (
            <p className="type-body text-transactional" role="alert">
              {formError}
            </p>
          ) : null}
          {notice ? (
            <p className="type-body text-accent" role="status">
              {notice}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-sm">
            <Button type="submit" loading={saving} disabled={saving}>
              {ownReview ? "Save review" : "Post review"}
            </Button>
            {ownReview && !confirmDelete ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            ) : null}
            {ownReview && confirmDelete ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={deleting}
                  disabled={deleting}
                  onClick={() => void remove()}
                >
                  Confirm delete
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
