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
import { listAdminOrganizers, type AdminOrganizerRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/organizers/")({
  head: () => ({ meta: [
    { title: "Organizers — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of organizer profiles and their events." },
  ] }),
  component: AdminOrganizersPage,
});

const PAGE_SIZE = 20;

type VerifiedFilter = "all" | "verified" | "unverified";

interface OrganizerFilters {
  q: string;
  verified: VerifiedFilter;
  offset: number;
}

const EMPTY_FILTERS: OrganizerFilters = { q: "", verified: "all", offset: 0 };

function AdminOrganizersPage() {
  const token = useAccessToken();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<OrganizerFilters>(EMPTY_FILTERS);
  const [organizers, setOrganizers] = useState<AdminOrganizerRow[] | null>(null);
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
      const result = await listAdminOrganizers({
        data: {
          limit: PAGE_SIZE,
          offset: filters.offset,
          q: filters.q || undefined,
          verified: filters.verified,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrganizers(result.organizers);
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
  const hasFilters = filters.q !== "" || filters.verified !== "all";

  return (
    <div className="grid gap-md">
      <div>
        <h2 className="type-h2">Organizers</h2>
        <p className="type-body mt-xs text-muted-text">
          Organizer profiles with their owners and event counts, newest first.
        </p>
      </div>

      <form onSubmit={submitSearch} className="grid gap-md sm:grid-cols-[1fr_220px]" role="search">
        <SearchField
          label="Search organizers by name, location, or slug"
          placeholder="Search by name, location, or slug…"
          value={draft}
          loading={loading && organizers !== null}
          onChange={(event) => setDraft(event.target.value)}
          onClear={clearSearch}
        />
        <label className="type-caption grid gap-xs font-semibold text-muted-text">
          Verification
          <select
            value={filters.verified}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                verified: event.target.value as VerifiedFilter,
                offset: 0,
              }))
            }
            className="type-body focus-ring h-12 rounded-md border border-line bg-card px-md font-normal"
          >
            <option value="all">All</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
        </label>
      </form>

      {loading && organizers === null ? (
        <div className="grid gap-md" aria-label="Loading organizers">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load organizers." description={error} onRetry={() => void refresh()} />
      ) : !organizers || organizers.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden className="size-5" />}
          title={hasFilters ? "No organizers match these filters." : "No organizers yet."}
          description={
            hasFilters
              ? "Try a different search term or clear the filters."
              : "Organizer profiles will appear here once created."
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
                  {["Name", "Owner", "Location", "Verified", "Events", "Joined"].map((column) => (
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
                {organizers.map((organizer) => (
                  <tr key={organizer.id} className="border-b border-line last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      <Link
                        to="/admin/organizers/$organizerId"
                        params={{ organizerId: organizer.id }}
                        className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                      >
                        {organizer.name}
                      </Link>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">{organizer.ownerName ?? "—"}</td>
                    <td className="type-body px-md py-sm text-muted-text">{organizer.location ?? "—"}</td>
                    <td className="px-md py-sm">
                      <Badge variant={organizer.verified ? "accent" : "neutral"}>
                        {organizer.verified ? "Verified" : "Unverified"}
                      </Badge>
                    </td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {organizer.eventCount} ({organizer.publishedCount} live)
                    </td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(organizer.createdAt).toLocaleDateString()}
                    </td>
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
