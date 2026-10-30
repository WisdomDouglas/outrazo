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
import { listAdminUsers, type AdminUserRow } from "@/showcase/admin/admin-functions";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [
    { title: "Users — Admin Console — Outrazo" },
    { name: "description", content: "Staff view of user accounts." },
  ] }),
  component: AdminUsersPage,
});

const PAGE_SIZE = 20;

type OnboardingFilter = "all" | "complete" | "incomplete";

interface UserFilters {
  q: string;
  onboarding: OnboardingFilter;
  offset: number;
}

const EMPTY_FILTERS: UserFilters = { q: "", onboarding: "all", offset: 0 };

function AdminUsersPage() {
  const token = useAccessToken();
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<UserFilters>(EMPTY_FILTERS);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
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
      const result = await listAdminUsers({
        data: {
          limit: PAGE_SIZE,
          offset: filters.offset,
          q: filters.q || undefined,
          onboarding: filters.onboarding,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(result.users);
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
  const hasFilters = filters.q !== "" || filters.onboarding !== "all";

  return (
    <div className="grid gap-md">
      <div>
        <h2 className="type-h2">Users</h2>
        <p className="type-body mt-xs text-muted-text">
          Real user accounts, newest first. Only the columns staff need are shown.
        </p>
      </div>

      <form onSubmit={submitSearch} className="grid gap-md sm:grid-cols-[1fr_220px]" role="search">
        <SearchField
          label="Search users by name, email, or location"
          placeholder="Search by name, email, or location…"
          value={draft}
          loading={loading && users !== null}
          onChange={(event) => setDraft(event.target.value)}
          onClear={clearSearch}
        />
        <label className="type-caption grid gap-xs font-semibold text-muted-text">
          Onboarding
          <select
            value={filters.onboarding}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                onboarding: event.target.value as OnboardingFilter,
                offset: 0,
              }))
            }
            className="type-body focus-ring h-12 rounded-md border border-line bg-card px-md font-normal"
          >
            <option value="all">All</option>
            <option value="complete">Complete</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </label>
      </form>

      {loading && users === null ? (
        <div className="grid gap-md" aria-label="Loading users">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorState title="We couldn't load users." description={error} onRetry={() => void refresh()} />
      ) : !users || users.length === 0 ? (
        <EmptyState
          icon={<Inbox aria-hidden className="size-5" />}
          title={hasFilters ? "No users match these filters." : "No users yet."}
          description={
            hasFilters
              ? "Try a different search term or clear the filters."
              : "Accounts will appear here once people sign up."
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
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["Name", "Email", "Location", "Onboarded", "Joined"].map((column) => (
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
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-line last:border-0">
                    <td className="type-body px-md py-sm font-medium">
                      <Link
                        to="/admin/users/$userId"
                        params={{ userId: user.id }}
                        className="focus-ring rounded-sm underline decoration-accent/50 underline-offset-2 hover:text-accent"
                      >
                        {user.name ?? "—"}
                      </Link>
                    </td>
                    <td className="type-body px-md py-sm text-muted-text">{user.email ?? "—"}</td>
                    <td className="type-body px-md py-sm text-muted-text">{user.location ?? "—"}</td>
                    <td className="px-md py-sm">
                      <Badge variant={user.onboardingCompleted ? "accent" : "neutral"}>
                        {user.onboardingCompleted ? "Complete" : "Incomplete"}
                      </Badge>
                    </td>
                    <td className="type-body px-md py-sm whitespace-nowrap text-muted-text">
                      {new Date(user.createdAt).toLocaleDateString()}
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
