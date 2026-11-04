import { BellOff } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import type { NotificationRow } from "@/showcase/notifications/notifications";

export interface NotificationPanelProps {
  notifications: NotificationRow[];
  loading: boolean;
  error: string | null;
  signedIn: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
}

function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationItem({
  note,
  onMarkRead,
}: {
  note: NotificationRow;
  onMarkRead: (id: string) => void;
}) {
  const unread = !note.readAt;
  const body = (
    <>
      <span className="flex items-start justify-between gap-sm">
        <span className="type-body font-medium">{note.title}</span>
        {unread ? (
          <span aria-label="Unread" className="mt-xs size-2 shrink-0 rounded-full bg-accent" />
        ) : null}
      </span>
      {note.body ? <span className="type-body mt-xs block text-muted-text">{note.body}</span> : null}
      {note.createdAt ? (
        <span className="type-caption mt-xs block text-subtle-text">{formatWhen(note.createdAt)}</span>
      ) : null}
    </>
  );
  const className =
    "focus-ring block w-full rounded-md px-sm py-md text-left transition-colors hover:bg-primary-text/5";
  if (note.link) {
    return (
      <li>
        <a href={note.link} className={className} onClick={() => onMarkRead(note.id)}>
          {body}
        </a>
      </li>
    );
  }
  return (
    <li>
      <button type="button" className={className} onClick={() => onMarkRead(note.id)}>
        {body}
      </button>
    </li>
  );
}

export function NotificationPanel({
  notifications,
  loading,
  error,
  signedIn,
  onMarkRead,
  onMarkAllRead,
  onRetry,
}: NotificationPanelProps) {
  const unread = notifications.filter((note) => !note.readAt).length;
  return (
    <section
      className="fixed right-md top-20 z-50 max-h-[70vh] w-[min(calc(100vw-var(--spacing-xl)),360px)] overflow-hidden rounded-lg border border-line bg-card shadow-card sm:absolute sm:right-0 sm:top-[calc(100%+var(--spacing-sm))]"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between gap-sm border-b border-line px-md py-sm">
        <h2 className="type-h3">Notifications</h2>
        {unread > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        ) : null}
      </div>
      <div className="max-h-[calc(70vh-57px)] overflow-y-auto p-sm">
        {loading ? (
          <p className="type-body px-sm py-md text-center text-muted-text" role="status">
            Loading notifications…
          </p>
        ) : !signedIn ? (
          <div className="flex flex-col items-center gap-sm px-sm py-md text-center">
            <span className="grid size-11 place-items-center rounded-full bg-accent/12 text-accent">
              <BellOff aria-hidden className="size-5" />
            </span>
            <p className="type-body text-muted-text">Sign in to see your updates.</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-sm px-sm py-md text-center">
            <p className="type-body text-muted-text">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-sm px-sm py-md text-center">
            <span className="grid size-11 place-items-center rounded-full bg-accent/12 text-accent">
              <BellOff aria-hidden className="size-5" />
            </span>
            <h3 className="type-h3">No notifications yet</h3>
            <p className="type-body text-muted-text">
              RSVP confirmations and event updates will appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {notifications.map((note) => (
              <NotificationItem key={note.id} note={note} onMarkRead={onMarkRead} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
