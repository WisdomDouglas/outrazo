// Buyer ticket passes (P1/P3). One visual pass per paid ticket unit: event
// context on top, the scannable QR stub below. The QR encodes the raw
// ticket code — the organizer's door scanner reads exactly this value.
// Event details are best-effort (a cancelled event may be unreadable); the
// order data always renders so a pass never goes blank.
import { Calendar, MapPin, Ticket, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/design-system/components/Badge";
import { Button } from "@/design-system/components/Button";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAccessToken } from "@/showcase/admin/admin-client";
import { fetchPublishedEventDetails } from "@/showcase/event-data";
import type { EventDetails } from "@/showcase/sample-data";
import { getMyTicketCodes, type OwnTicketCode, type TicketOrderSummary } from "./ticket-functions";

function friendlyError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

function TicketPass({
  code,
  event,
  eventTitle,
  holderName,
  orderReference,
  index,
  total,
}: {
  code: OwnTicketCode;
  event: EventDetails | null;
  eventTitle: string;
  holderName: string;
  orderReference: string;
  index: number;
  total: number;
}) {
  const checkedIn = code.status === "checked_in";
  return (
    <article
      className="overflow-hidden rounded-2xl border border-line bg-card shadow-card"
      aria-label={`Ticket ${index + 1} of ${total} for ${eventTitle}`}
    >
      {event?.imageSrc ? (
        <div className="relative h-32 w-full overflow-hidden bg-elevated sm:h-36">
          <img src={event.imageSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" aria-hidden />
          <p className="absolute bottom-2 left-4 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
            {code.tierName}
          </p>
        </div>
      ) : null}
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-sm">
          <div className="min-w-0">
            <p className="type-caption font-mono text-muted-text">
              Ticket {index + 1} of {total}
            </p>
            <h3 className="type-h3 mt-xs leading-snug">{event?.title ?? eventTitle}</h3>
          </div>
          {checkedIn ? (
            <Badge variant="neutral">Checked in</Badge>
          ) : (
            <Badge variant="accent">Valid for entry</Badge>
          )}
        </div>
        <dl className="mt-md grid gap-xs text-xs text-muted-text">
          {event ? (
            <>
              <div className="flex items-center gap-1.5">
                <Calendar aria-hidden className="size-3.5 shrink-0 text-accent" />
                <span>
                  {event.date}
                  {event.time ? ` · ${event.time}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin aria-hidden className="size-3.5 shrink-0 text-accent" />
                <span className="truncate">{event.location}</span>
              </div>
            </>
          ) : null}
          <div className="flex items-center gap-1.5">
            <UserRound aria-hidden className="size-3.5 shrink-0 text-accent" />
            <span className="truncate">{holderName}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Ticket aria-hidden className="size-3.5 shrink-0 text-accent" />
            <span className="font-mono">Order {orderReference}</span>
          </div>
        </dl>
      </div>
      <div className="relative mx-4 border-t border-dashed border-line" aria-hidden>
        <div className="absolute -left-5 -top-2 size-4 rounded-full bg-canvas border-r border-line" />
        <div className="absolute -right-5 -top-2 size-4 rounded-full bg-canvas border-l border-line" />
      </div>
      <div className="flex flex-col items-center gap-sm p-4 text-center sm:p-5">
        <span className="rounded-xl bg-white p-3 shadow-card">
          <QRCodeSVG value={code.code} size={152} aria-label={`QR code for ticket ${code.code}`} />
        </span>
        <p className="type-body font-mono font-semibold tracking-wide">{code.code}</p>
        {checkedIn && code.checkedInAt ? (
          <p className="type-caption text-muted-text">
            Entered {new Date(code.checkedInAt).toLocaleString()}
          </p>
        ) : (
          <p className="type-caption text-muted-text">
            Show this QR at the door — each code admits one person, once.
          </p>
        )}
      </div>
    </article>
  );
}

export function TicketPassList({
  order,
  holderName,
}: {
  order: TicketOrderSummary;
  holderName: string;
}) {
  const token = useAccessToken();
  const [codes, setCodes] = useState<OwnTicketCode[] | null>(null);
  const [event, setEvent] = useState<EventDetails | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (!token) {
      setCodes([]);
      setEvent(null);
      return;
    }
    let active = true;
    getMyTicketCodes({
      data: { orderId: order.orderId },
      headers: { Authorization: `Bearer ${token}` },
    }).then(
      (result) => {
        if (!active) return;
        setCodes(result.codes);
        setError(null);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught));
      },
    );
    fetchPublishedEventDetails(order.eventId).then(
      (details) => {
        if (!active) return;
        setEvent(details ?? null);
      },
      () => {
        if (!active) return;
        setEvent(null);
      },
    );
    return () => {
      active = false;
    };
  }, [order.eventId, order.orderId, request, token]);

  if (error) {
    return (
      <ErrorState
        title="We couldn't load your tickets."
        description={error}
        onRetry={() => setRequest((n) => n + 1)}
      />
    );
  }
  if (codes === null || event === undefined) {
    return <Skeleton className="h-96 rounded-2xl" />;
  }
  if (codes.length === 0) {
    return (
      <p className="type-body rounded-xl border border-line bg-card px-md py-md text-muted-text" role="status">
        Ticket codes are being issued — refresh in a moment.
      </p>
    );
  }
  return (
    <ul className="grid gap-md sm:gap-lg" aria-label={`Tickets for ${order.eventTitle}`}>
      {codes.map((code, index) => (
        <li key={code.code}>
          <TicketPass
            code={code}
            event={event}
            eventTitle={order.eventTitle}
            holderName={holderName}
            orderReference={order.reference}
            index={index}
            total={codes.length}
          />
        </li>
      ))}
    </ul>
  );
}

export function TicketPassDialog({
  order,
  holderName,
  open,
  onClose,
}: {
  order: TicketOrderSummary | null;
  holderName: string;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open || !order) return null;
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-md backdrop-blur-sm sm:p-lg"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mx-auto grid w-full max-w-[560px] gap-md py-lg"
        role="dialog"
        aria-modal="true"
        aria-label={`Tickets for ${order.eventTitle}`}
        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-sm">
          <h2 className="type-h2 text-white">Your tickets</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 bg-card"
            onClick={onClose}
            aria-label="Close tickets"
          >
            <X aria-hidden className="size-5" />
          </Button>
        </div>
        <TicketPassList order={order} holderName={holderName} />
      </div>
    </div>
  );
}
