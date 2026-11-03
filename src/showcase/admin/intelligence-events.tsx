// Admin Intelligence event performance section (Phase 1). Searchable,
// paged per-event cards with RSVPs, saves, ticket totals, attendance, and
// capacity fill — every figure from server aggregates. AI summaries generate
// on demand per event and render beneath their own verified figures.
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { CATEGORIES } from "@/showcase/discovery/categories";
import {
  friendlyAdminError,
  useAccessToken,
} from "@/showcase/admin/admin-client";
import {
  generateEventSummary,
  listIntelligenceEvents,
  type EventPerformanceList,
  type EventPerformanceRow,
} from "@/showcase/admin/intelligence-functions";

const PAGE_SIZE = 10;

function categoryLabel(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

function money(code: string, amount: number): string {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency: code }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString()}`;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="type-caption font-semibold tracking-wide text-muted-text uppercase">{label}</p>
      <p className="type-body mt-2xs font-semibold">{value}</p>
    </div>
  );
}

function SummaryPanel({ eventId }: { eventId: string }) {
  const token = useAccessToken();
  const [summary, setSummary] = useState<string | null>(null);
  const [takeaways, setTakeaways] = useState<string[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateEventSummary({
        data: { eventId },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSummary(result.summary);
      setTakeaways(result.takeaways);
      setGeneratedAt(result.generatedAt);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, eventId]);

  if (summary === null && !loading && !error) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void generate()}>
        Generate AI summary
      </Button>
    );
  }
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas p-md">
      <p className="type-caption font-semibold tracking-wide text-muted-text uppercase">
        AI summary
      </p>
      {loading ? (
        <div className="mt-sm grid gap-xs" aria-label="Generating summary">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
        </div>
      ) : error ? (
        <div className="mt-sm">
          <p className="type-body text-transactional">{error}</p>
          <Button type="button" variant="outline" size="sm" className="mt-sm" onClick={() => void generate()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          <p className="type-body mt-sm">{summary}</p>
          {takeaways.length > 0 ? (
            <ul className="type-body mt-sm list-disc space-y-2xs pl-md text-muted-text">
              {takeaways.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
          ) : null}
          {generatedAt ? (
            <p className="type-caption mt-sm text-muted-text">
              Generated {new Date(generatedAt).toLocaleString()} from the figures above.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function PerformanceCard({ event }: { event: EventPerformanceRow }) {
  const ticketEntries = event.tickets ? Object.entries(event.tickets.grossByCurrency) : [];
  return (
    <article className="rounded-lg border border-line bg-card p-lg shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="min-w-0">
          <Link
            to="/admin/events/$eventId"
            params={{ eventId: event.id }}
            className="focus-ring rounded-sm type-body font-semibold hover:text-accent"
          >
            {event.title}
          </Link>
          <p className="type-body mt-2xs text-muted-text">
            {categoryLabel(event.category)}
            {event.city ? ` · ${event.city}` : ""} ·{" "}
            {event.startsAt ? new Date(event.startsAt).toLocaleDateString() : "Date to be announced"}
          </p>
        </div>
        <Badge variant={event.published ? "accent" : "neutral"}>
          {event.published ? "Published" : "Draft"}
        </Badge>
      </div>

      <div className="mt-md grid grid-cols-2 gap-md sm:grid-cols-4">
        <Stat label="RSVPs" value={event.rsvps === null ? "Unavailable" : String(event.rsvps)} />
        <Stat label="Saves" value={event.saves === null ? "Unavailable" : String(event.saves)} />
        <Stat label="Attending" value={String(event.attendeeCount)} />
        <Stat
          label="Ticket orders"
          value={event.tickets === null ? "Unavailable" : String(event.tickets.orders)}
        />
      </div>

      <div className="type-body mt-md text-muted-text">
        {event.fillPct === null ? (
          <p>No capacity set — fill cannot be computed.</p>
        ) : (
          <p>
            {event.fillPct}% full ({event.attendeeCount} of {event.capacity})
          </p>
        )}
        {event.tickets !== null && ticketEntries.length > 0 ? (
          <p className="mt-2xs">
            Gross: {ticketEntries.map(([code, amount]) => money(code, amount)).join(" · ")}
          </p>
        ) : event.tickets !== null && event.tickets.orders === 0 ? (
          <p className="mt-2xs">No ticket orders yet.</p>
        ) : null}
      </div>

      <div className="mt-md">
        <SummaryPanel eventId={event.id} />
      </div>
    </article>
  );
}

export function EventPerformanceSection() {
  const token = useAccessToken();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<EventPerformanceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listIntelligenceEvents({
        data: { q: submitted, limit: PAGE_SIZE, offset },
        headers: { Authorization: `Bearer ${token}` },
      });
      setList(result);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, submitted, offset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalPages = list === null ? 0 : Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE);

  return (
    <section aria-label="Event performance" className="grid gap-md">
      <div>
        <h3 className="type-h3">Event performance</h3>
        <p className="type-body mt-xs text-muted-text">
          Per-event RSVPs, saves, ticket activity, and capacity fill. “Unavailable”
          means your role may not see that figure — it never means zero.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-sm"
        onSubmit={(form) => {
          form.preventDefault();
          setOffset(0);
          setSubmitted(query);
        }}
      >
        <label htmlFor="intelligence-event-search" className="sr-only">
          Search events by title, city, or venue
        </label>
        <input
          id="intelligence-event-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, city, or venue…"
          maxLength={120}
          className="focus-ring min-w-0 flex-1 rounded-lg border border-line bg-card px-md py-sm type-body"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {loading && list === null ? (
        <div className="grid gap-md" aria-label="Loading event performance">
          <Skeleton className="h-52 rounded-lg" />
          <Skeleton className="h-52 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState
          title="We couldn't load event performance."
          description={error}
          onRetry={() => void refresh()}
        />
      ) : list === null || list.events.length === 0 ? (
        <EmptyState
          title={submitted ? "No events match that search." : "No events yet."}
          description={
            submitted ? "Try a different title, city, or venue." : "Performance cards appear once events exist."
          }
        />
      ) : (
        <>
          <div className="grid gap-md">
            {list.events.map((event) => (
              <PerformanceCard key={event.id} event={event} />
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setOffset((page - 1) * PAGE_SIZE)}
              >
                Previous
              </Button>
              <p className="type-body text-muted-text">
                Page {page + 1} of {totalPages} · {list.total} events
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setOffset((page + 1) * PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
