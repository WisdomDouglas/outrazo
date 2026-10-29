import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";

interface AdminTableProps {
  title: string;
  description: string;
  columns: string[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  emptyTitle: string;
  emptyDescription: string;
  isEmpty: boolean;
  children: ReactNode;
}

/** Shared loading/error/empty/table shell for the read-only admin views. */
export function AdminTable({
  title,
  description,
  columns,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  isEmpty,
  children,
}: AdminTableProps) {
  if (loading) {
    return (
      <div className="grid gap-md" aria-label={`Loading ${title}`}>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorState title={`We couldn't load ${title.toLowerCase()}.`} description={error} onRetry={onRetry} />;
  }

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Inbox aria-hidden className="size-5" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <section aria-label={title} className="grid gap-md">
      <div>
        <h2 className="type-h2">{title}</h2>
        <p className="type-body mt-xs text-muted-text">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-card shadow-card">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th key={column} scope="col" className="type-caption px-md py-sm font-semibold tracking-wide text-muted-text uppercase">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
