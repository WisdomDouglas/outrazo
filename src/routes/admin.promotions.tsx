import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { SearchField } from "@/design-system/components/SearchField";
import { Skeleton } from "@/design-system/components/Skeleton";
import { ConfirmAction } from "@/showcase/admin/ConfirmAction";
import {
  friendlyAdminError,
  useAccessToken,
  useMyAdminRole,
} from "@/showcase/admin/admin-client";
import {
  cancelAdminPromotion,
  createAdminPromotion,
  listAdminEvents,
  listAdminPromotions,
  type AdminEventRow,
  type AdminPromotionRow,
} from "@/showcase/admin/admin-functions";
import { roleHasPermission } from "@/showcase/admin/permissions";
import {
  checkPromotionWindow,
  PROMOTION_DISPLAY_STATUSES,
  PROMOTION_STATUS_LABELS,
  type PromotionDisplayStatus,
} from "@/showcase/promotions/promotion-windows";

export const Route = createFileRoute("/admin/promotions")({
  head: () => ({ meta: [
    { title: "Promotions — Admin Console — Outrazo" },
    { name: "description", content: "Schedule homepage featured events. Many events can promote at once; one live window per event." },
  ] }),
  component: AdminPromotionsPage,
});

const PAGE_SIZE = 20;
const EVENT_SEARCH_LIMIT = 8;

type StatusFilter = PromotionDisplayStatus | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  ...PROMOTION_DISPLAY_STATUSES.map((status) => ({ value: status as StatusFilter, label: PROMOTION_STATUS_LABELS[status] })),
];

function statusBadge(status: PromotionDisplayStatus) {
  if (status === "active") return <Badge variant="accent">{PROMOTION_STATUS_LABELS[status]}</Badge>;
  if (status === "scheduled") return <Badge variant="transactional">{PROMOTION_STATUS_LABELS[status]}</Badge>;
  return <Badge variant="neutral">{PROMOTION_STATUS_LABELS[status]}</Badge>;
}

function formatWindow(value: string) {
  return new Date(value).toLocaleString();
}

function AdminPromotionsPage() {
  const token = useAccessToken();
  const { role } = useMyAdminRole();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const [promotions, setPromotions] = useState<AdminPromotionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const [eventQuery, setEventQuery] = useState("");
  const [eventResults, setEventResults] = useState<AdminEventRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");

  const canManage = role !== null && roleHasPermission(role, "promotions.manage");

  const refresh = useCallback(async () => {
    if (!token) {
      setError("Sign in to use the admin console.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminPromotions({
        data: { limit: PAGE_SIZE, offset, status },
        headers: { Authorization: `Bearer ${token}` },
      });
      setPromotions(result.promotions);
      setTotal(result.total);
    } catch (caught) {
      setError(friendlyAdminError(caught));
    } finally {
      setLoading(false);
    }
  }, [token, offset, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const searchEvents = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await listAdminEvents({
        data: { limit: EVENT_SEARCH_LIMIT, offset: 0, q: eventQuery.trim() || undefined, published: "published" },
        headers: { Authorization: `Bearer ${token}` },
      });
      // Cancelled events stay selectable nowhere: the picker hides them and
      // the server re-checks eligibility anyway.
      setEventResults(result.events.filter((row) => (row.status ?? "") !== "cancelled"));
    } catch (caught) {
      setSearchError(friendlyAdminError(caught));
    } finally {
      setSearching(false);
    }
  };

  const clearEventSearch = () => {
    setEventQuery("");
    setEventResults(null);
    setSearchError(null);
    setSelectedEventId(null);
  };

  const submitPromotion = async () => {
    if (!token || !canManage || acting) return;
    setActing(true);
    setActionMessage(null);
    setActionError(null);
    try {
      if (!selectedEventId) {
        throw new Error("Choose an event to promote first.");
      }
      // datetime-local yields wall time in the staff browser's zone; ISO with
      // offset is what the server and database expect.
      const startsAt = startsLocal ? new Date(startsLocal).toISOString() : "";
      const endsAt = endsLocal ? new Date(endsLocal).toISOString() : "";
      const windowError = checkPromotionWindow(startsAt, endsAt);
      if (windowError) {
        throw new Error(windowError);
      }
      await createAdminPromotion({
        data: { eventId: selectedEventId, startsAt, endsAt },
        headers: { Authorization: `Bearer ${token}` },
      });
      setActionMessage("Promotion scheduled. It appears on the homepage only inside its window.");
      setSelectedEventId(null);
      setStartsLocal("");
      setEndsLocal("");
      setOffset(0);
      await refresh();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    } finally {
      setActing(false);
    }
  };

  const cancelPromotion = async (id: string) => {
    if (!token) return;
    setActionMessage(null);
    setActionError(null);
    try {
      await cancelAdminPromotion({
        data: { id },
        headers: { Authorization: `Bearer ${token}` },
      });
      setActionMessage("Promotion cancelled. That event's window is free for that time again.");
      await refresh();
    } catch (caught) {
      setActionError(friendlyAdminError(caught));
    }
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="grid gap-lg">
      <div>
        <h2 className="type-h2">Promotions</h2>
        <p className="type-body mt-xs text-muted-text">
          Many events can be promoted at the same time. Overlapping windows are rejected
          only for the same event, and scheduled rows appear only inside their window.
        </p>
      </div>

      {actionMessage ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="status">
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm" role="alert">
          {actionError}
        </p>
      ) : null}

      <section aria-label="Schedule a promotion" className="grid gap-md rounded-lg border border-line bg-card p-lg shadow-card">
        <div>
          <h3 className="type-h3">Schedule a promotion</h3>
          <p className="type-body mt-xs text-muted-text">
            Pick a published event and a start/end window. Times use your device timezone.
          </p>
        </div>
        {canManage ? (
          <div className="grid gap-md">
            <form onSubmit={(event) => void searchEvents(event)} className="grid gap-md" role="search">
              <SearchField
                label="Find a published event to promote"
                placeholder="Search published events…"
                value={eventQuery}
                loading={searching}
                onChange={(event) => setEventQuery(event.target.value)}
                onClear={clearEventSearch}
              />
            </form>
            {searchError ? (
              <p className="type-body" role="alert">{searchError}</p>
            ) : null}
            {eventResults !== null ? (
              eventResults.length === 0 ? (
                <p className="type-body text-muted-text" role="status">
                  No published, non-cancelled events match that search.
                </p>
              ) : (
                <div className="grid gap-xs" role="radiogroup" aria-label="Promotable events">
                  {eventResults.map((row) => (
                    <label
                      key={row.id}
                      className={`focus-ring flex cursor-pointer items-center gap-sm rounded-md border px-md py-sm ${selectedEventId === row.id ? "border-accent bg-accent/8" : "border-line"}`}
                    >
                      <input
                        type="radio"
                        name="promotion-event"
                        value={row.id}
                        checked={selectedEventId === row.id}
                        onChange={() => setSelectedEventId(row.id)}
                        className="size-4 shrink-0 accent-accent"
                      />
                      <span className="min-w-0">
                        <span className="type-body block truncate font-medium">{row.title}</span>
                        <span className="type-body block truncate text-muted-text">
                          {[row.city, row.startsAt ? new Date(row.startsAt).toLocaleDateString() : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )
            ) : null}
            <div className="grid gap-md sm:grid-cols-2">
              <label className="type-body grid gap-xs font-semibold" htmlFor="promotion-starts">
                Starts
                <input
                  id="promotion-starts"
                  type="datetime-local"
                  value={startsLocal}
                  onChange={(event) => setStartsLocal(event.target.value)}
                  className="type-body focus-ring rounded-md border border-line bg-canvas px-md py-sm font-normal"
                />
              </label>
              <label className="type-body grid gap-xs font-semibold" htmlFor="promotion-ends">
                Ends
                <input
                  id="promotion-ends"
                  type="datetime-local"
                  value={endsLocal}
                  onChange={(event) => setEndsLocal(event.target.value)}
                  className="type-body focus-ring rounded-md border border-line bg-canvas px-md py-sm font-normal"
                />
              </label>
            </div>
            <div>
              <ConfirmAction
                label="Schedule promotion"
                question="Schedule this promotion?"
                disabled={acting || !selectedEventId || !startsLocal || !endsLocal}
                onConfirm={submitPromotion}
              />
            </div>
          </div>
        ) : (
          <p className="type-body text-muted-text">
            You can view promotions, but scheduling them requires the promotions.manage permission.
          </p>
        )}
      </section>

      <div className="grid gap-md">
        <div className="flex flex-wrap items-end justify-between gap-md">
          <h3 className="type-h3">Scheduled &amp; past promotions</h3>
          <label className="type-caption grid gap-xs font-semibold text-muted-text">
            Status
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as StatusFilter);
                setOffset(0);
              }}
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-normal"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && promotions === null ? (
          <div className="grid gap-md" aria-label="Loading promotions">
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : error ? (
          <ErrorState title="We couldn't load promotions." description={error} onRetry={() => void refresh()} />
        ) : !promotions || promotions.length === 0 ? (
          <EmptyState
            icon={<CalendarClock aria-hidden className="size-5" />}
            title={status === "all" ? "No promotions yet." : "No promotions with this status."}
            description={
              status === "all"
                ? "Schedule the first promotion above to feature an event on the homepage."
                : "Try a different status filter."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-line">
                    {["Event", "Window", "Status", "Scheduled by", ""].map((column) => (
                      <th
                        key={column || "actions"}
                        scope="col"
                        className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promotion) => {
                    const cancellable =
                      promotion.displayStatus === "scheduled" || promotion.displayStatus === "active";
                    return (
                      <tr key={promotion.id} className="border-b border-line last:border-0">
                        <td className="type-body px-md py-sm font-medium">
                          <Link
                            to="/admin/events/$eventId"
                            params={{ eventId: promotion.eventId }}
                            className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                          >
                            {promotion.eventTitle}
                          </Link>
                          {!promotion.eventPublished ? (
                            <span className="type-caption ml-xs text-muted-text">(draft)</span>
                          ) : null}
                        </td>
                        <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                          {formatWindow(promotion.startsAt)} → {formatWindow(promotion.endsAt)}
                        </td>
                        <td className="px-md py-sm">{statusBadge(promotion.displayStatus)}</td>
                        <td className="type-body px-md py-sm text-muted-text">
                          {promotion.createdByName ?? "Deleted user"}
                        </td>
                        <td className="px-md py-sm text-right">
                          {canManage && cancellable ? (
                            <ConfirmAction
                              label="Cancel"
                              question="Cancel this promotion?"
                              disabled={false}
                              onConfirm={() => cancelPromotion(promotion.id)}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
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
                  disabled={offset === 0 || loading}
                  onClick={() => setOffset((current) => current - PAGE_SIZE)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total || loading}
                  onClick={() => setOffset((current) => current + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
