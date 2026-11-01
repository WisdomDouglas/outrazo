import { useState } from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ImageOff, Megaphone, Minus, Plus, ShieldCheck } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { ORDER_DAYS_MAX, ORDER_DAYS_MIN, formatKoboToNgn } from "@/showcase/promotions/paid-promotion-orders";
import { usePromoteEvent } from "@/showcase/promotions/use-promote-event";

export const Route = createFileRoute("/app/organizer/promote/$eventId")({
  head: () => ({ meta: [
    { title: "Boost Event — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Promote your event to more attendees with a paid boost." },
  ] }),
  component: PromoteEventPage,
});

function DurationSelector({
  days,
  suggested,
  onChange,
  disabled,
}: {
  days: number;
  suggested: readonly number[];
  onChange: (days: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-sm">
      <div className="flex flex-wrap gap-sm" role="group" aria-label="Promotion duration in days">
        {suggested.map((option) => (
          <Button
            key={option}
            type="button"
            variant={days === option ? "primary" : "outline"}
            size="sm"
            disabled={disabled}
            onClick={() => onChange(option)}
            aria-pressed={days === option}
          >
            {option} {option === 1 ? "day" : "days"}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-sm">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || days <= ORDER_DAYS_MIN}
          onClick={() => onChange(days - 1)}
          aria-label="One day less"
        >
          <Minus aria-hidden className="size-4" />
        </Button>
        <label className="type-body text-muted-text" htmlFor="boost-days">
          Custom duration
        </label>
        <input
          id="boost-days"
          type="number"
          inputMode="numeric"
          className="focus-ring h-11 w-20 rounded-md border border-line bg-card px-md text-center type-body"
          min={ORDER_DAYS_MIN}
          max={ORDER_DAYS_MAX}
          value={days}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="type-body text-muted-text">days (max {ORDER_DAYS_MAX})</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || days >= ORDER_DAYS_MAX}
          onClick={() => onChange(days + 1)}
          aria-label="One day more"
        >
          <Plus aria-hidden className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function PromoteEventPage() {
  const { eventId } = Route.useParams();
  const state = usePromoteEvent(eventId);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  return (
    <div className="grid gap-lg">
      <Link to="/app/organizer/events" className="focus-ring inline-flex w-fit items-center gap-xs rounded-full type-body text-muted-text">
        <ArrowLeft aria-hidden className="size-4" /> Back to My events
      </Link>

      <div>
        <h2 className="type-h2">Boost event</h2>
        <p className="type-body mt-xs text-muted-text">
          Pay to promote this event across Outrazo discovery. Payment is verified before anything goes live.
        </p>
      </div>

      {state.notice ? (
        <div className="rounded-lg border border-line bg-card p-md type-body" role="status">
          {state.notice}{" "}
          <button type="button" className="focus-ring underline" onClick={state.dismissNotice}>
            Dismiss
          </button>
        </div>
      ) : null}

      {state.eventLoading ? (
        <Skeleton className="h-40 w-full" aria-label="Loading event" />
      ) : state.eventError || !state.event ? (
        <ErrorState
          title="Could not load this event"
          description={state.eventError ?? "That event was not found among your events."}
        />
      ) : (
        <section className="flex flex-col gap-md rounded-lg border border-line bg-card p-md shadow-card sm:flex-row sm:items-center" aria-label="Event to promote">
          {state.event.details.imageSrc ? (
            <img
              src={state.event.details.imageSrc}
              alt=""
              className="h-24 w-full shrink-0 rounded-md object-cover sm:w-36"
              loading="lazy"
            />
          ) : (
            <span aria-hidden className="grid h-24 w-full shrink-0 place-items-center rounded-md bg-accent/12 text-accent sm:w-36">
              <ImageOff className="size-5" />
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-xs">
            <p className="type-h3 truncate">{state.event.details.title}</p>
            <p className="type-body text-muted-text">
              {state.event.details.date} · {state.event.details.time}
            </p>
            <p className="type-body truncate text-muted-text">{state.event.details.location}</p>
            <div className="flex flex-wrap gap-xs">
              <Badge variant={state.event.published ? "accent" : "neutral"}>
                {state.event.published ? "Published" : "Draft"}
              </Badge>
              <Badge variant="outline">{state.event.details.category}</Badge>
            </div>
          </div>
        </section>
      )}

      {state.pendingOrder && !state.ordersLoading ? (
        <section className="grid gap-sm rounded-lg border border-line bg-card p-md shadow-card" aria-label="Pending checkout">
          <p className="type-h3">You have a pending checkout</p>
          <p className="type-body text-muted-text">
            {state.pendingOrder.days} {state.pendingOrder.days === 1 ? "day" : "days"} ·{" "}
            {formatKoboToNgn(state.pendingOrder.totalKobo)} · awaiting payment.
          </p>
          <div className="flex flex-wrap gap-sm">
            <Button
              type="button"
              variant="transactional"
              size="sm"
              loading={state.starting}
              onClick={() => void state.startCheckout()}
            >
              Resume checkout
            </Button>
            {confirmingCancel ? (
              <>
                <span className="type-body w-full text-muted-text">
                  Cancel this pending checkout? No payment was made.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={state.cancelling}
                  onClick={() => {
                    const pendingId = state.pendingOrder?.id;
                    setConfirmingCancel(false);
                    if (pendingId) void state.cancelOrder(pendingId);
                  }}
                >
                  Yes, cancel it
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={state.cancelling}
                  onClick={() => setConfirmingCancel(false)}
                >
                  Keep checkout
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmingCancel(true)}
              >
                Cancel checkout
              </Button>
            )}
          </div>
          {state.cancelError ? <p className="type-body text-transactional" role="alert">{state.cancelError}</p> : null}
        </section>
      ) : null}

      <section className="grid gap-md rounded-lg border border-line bg-card p-md shadow-card" aria-label="Promotion checkout">
        <p className="type-h3">Choose duration</p>
        <DurationSelector
          days={state.days}
          suggested={state.suggestedDurations}
          onChange={state.setDays}
          disabled={state.starting || state.quoteLoading}
        />

        {state.quoteLoading ? (
          <Skeleton className="h-20 w-full" aria-label="Loading price" />
        ) : state.quoteError ? (
          <ErrorState title="Promotion unavailable" description={state.quoteError} />
        ) : state.quote ? (
          <dl className="grid gap-xs rounded-md bg-primary-text/4 p-md">
            <div className="flex items-center justify-between gap-md">
              <dt className="type-body text-muted-text">Daily rate</dt>
              <dd className="type-body">{formatKoboToNgn(state.quote.dailyKobo)}</dd>
            </div>
            <div className="flex items-center justify-between gap-md">
              <dt className="type-body text-muted-text">Duration</dt>
              <dd className="type-body">{state.quote.days} {state.quote.days === 1 ? "day" : "days"}</dd>
            </div>
            <div className="flex items-center justify-between gap-md border-t border-line pt-sm">
              <dt className="type-body font-medium">Total due</dt>
              <dd className="type-h3">{formatKoboToNgn(state.quote.totalKobo)}</dd>
            </div>
          </dl>
        ) : null}

        {state.startError ? <p className="type-body text-transactional" role="alert">{state.startError}</p> : null}

        <div className="flex flex-wrap items-center gap-sm">
          <Button
            type="button"
            variant="transactional"
            size="md"
            loading={state.starting}
            disabled={!state.quote || state.quoteLoading}
            leadingIcon={<Megaphone aria-hidden className="size-4" />}
            onClick={() => void state.startCheckout()}
          >
            {state.pendingOrder ? "Resume payment" : "Continue to payment"}
          </Button>
          <p className="type-body flex items-center gap-xs text-muted-text">
            <ShieldCheck aria-hidden className="size-4" />
            Secure Bachs checkout. Your promotion activates only after verified payment.
          </p>
        </div>
      </section>
    </div>
  );
}
