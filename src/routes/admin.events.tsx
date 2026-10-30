import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Inbox } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { SearchField } from "@/design-system/components/SearchField";
import { Skeleton } from "@/design-system/components/Skeleton";
import { friendlyAdminError, useAccessToken } from "@/showcase/admin/admin-client";
import { listAdminEvents, type AdminEventRow } from "@/showcase/admin/admin-functions";
import { CATEGORIES } from "@/showcase/discovery/categories";
import { ACTIVE_STATUS, CANCELLED_STATUS } from "@/showcase/admin/event-transitions";

export const Route = createFileRoute("/admin/events")({
  head: () => ({ meta: [
    { title: "Events — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of every event across organizers." },
  ] }),
  component: AdminEventsPage,
});

const PAGE_SIZE = 20;

type PublishedFilter = "all" | "published" | "draft";

interface EventFilters {
  q: string;
  published: PublishedFilter;
  status: string;
  category: string;
  offset: number;
}

const EMPTY_FILTERS: EventFilters = { q: "", published: "all", status: "", category: "", offset: 0 };

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: ACTIVE_STATUS, label: "Upcoming" },
  { value: CANCELLED_STATUS, label: "Cancelled" },
];

function AdminEventsPage() {
  const token = useAccessToken();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS);
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
  const [total, setTotal] = useState(0);
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
      const result = await listAdminEvents({
        data: {
          limit: PAGE_SIZE,
          offset: filters.offset,
          q: filters.q || undefined,
          published: filters.published,
          status: filters.status || undefined,
          category: filters.category || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(result.events);
      setTotal(result.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: draft.trim(), offset: 0 }));
  };

  const clearSearch = () => {
    setDraft("");
    setFilters((current) => ({ ...current, q: "", offset: 0 }));
  };

  const clearFilters = () => {
    setDraft("");
    setFilters(EMPTY_FILTERS);
  };

  const page = Math.floor(filters.offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : filters.offset + 1;
  const to = Math.min(filters.offset + PAGE_SIZE, total);
  const hasFilters =
    filters.q !== "" || filters.published !== "all" || filters.status !== "" || filters.category !== "";

  return (
    <div className="grid gap-md">
      <div>
        <h2 className="type-h2">Events</h2>
        <p className="type-body mt-xs text-muted-text">
          Every event in the database, newest first, across all organizers.
        </p>
      </div>

      <form onSubmit={submitSearch} className="grid gap-md" role="search">
        <SearchField
          label="Search events by title, city, or venue"
          placeholder="Search by title, city, or venue…"
          value={draft}
          loading={loading && events !== null}
          onChange={(event) => setDraft(event.target.value)}
          onClear={clearSearch}
        />
        <div className="grid gap-md sm:grid-cols-3">
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Publication
            <select
              value={filters.published}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  published: event.target.value as PublishedFilter,
                  offset: 0,
                }))
              }
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              <option value="all">All</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </label>
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Status
            <select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value, offset: 0 }))
              }
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Category
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((current) => ({ ...current, category: event.target.value, offset: 0 }))
              }
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              <option value="">All categories</option>
              {CATEGORIES.filter((category) => category.id !== "all").map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>

      {loading && events === null ? (
        <div className="grid gap-md" aria-label="Loading events">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load events." description={error} onRetry={() => void refresh()} />
      ) : !events || events.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden className="size-5" />}
          title={hasFilters ? "No events match these filters." : "No events yet."}
          description={
            hasFilters
              ? "Try a different search term or clear the filters."
              : "Published and draft events will appear here."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Title", "Category", "City", "Starts", "Status", "RSVPs"].map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-line last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      <Link
                        to="/admin/events/$eventId"
                        params={{ eventId: event.id }}
                        className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                      >
                        {event.title}
                      </Link>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">{event.category ?? "—"}</td>
                    <td className="type-body px-md py-sm text-muted-text">{event.city ?? "—"}</td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(event.startsAt).toLocaleString()}
                    </td>
                    <td className="px-md py-sm">
                      <span className="inline-flex flex-wrap gap-xs">
                        <Badge variant={event.published ? "accent" : "neutral"}>
                          {event.published ? "Published" : "Draft"}
                        </Badge>
                        {event.status === CANCELLED_STATUS ? (
                          <Badge variant="transactional">Cancelled</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">{event.attendeeCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <p className="type-body text-muted-text" role="status">
              Showing {from}–{to} of {total} · Page {page} of {pageCount}
            </p>
            <div className="flex gap-xs">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.offset === 0 || loading}
                onClick={() =>
                  setFilters((current) => ({ ...current, offset: current.offset - PAGE_SIZE }))
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.offset + PAGE_SIZE >= total || loading}
                onClick={() =>
                  setFilters((current) => ({ ...current, offset: current.offset + PAGE_SIZE }))
                }
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
