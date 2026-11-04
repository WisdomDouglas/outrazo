// Buyer ticket codes with scannable QR (P3). Each paid ticket unit gets
// one code; the door scanner reads it and the server validates it. Codes
// come from the ownership-checked server function, never the URL.
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/design-system/components/Badge";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAccessToken } from "@/showcase/admin/admin-client";
import { getMyTicketCodes, type OwnTicketCode } from "./ticket-functions";

function friendlyError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

export function TicketCodesList({ orderId }: { orderId: string }) {
  const token = useAccessToken();
  const [codes, setCodes] = useState<OwnTicketCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState(0);

  useEffect(() => {
    if (!token) {
      setCodes([]);
      return;
    }
    let active = true;
    getMyTicketCodes({
      data: { orderId },
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
    return () => {
      active = false;
    };
  }, [orderId, request, token]);

  if (error) {
    return (
      <ErrorState
        title="We couldn't load your ticket codes."
        description={error}
        onRetry={() => setRequest((n) => n + 1)}
      />
    );
  }
  if (codes === null) {
    return <Skeleton className="h-48 rounded-lg" />;
  }
  if (codes.length === 0) {
    return (
      <p className="type-body text-muted-text" role="status">
        Ticket codes are being issued — refresh in a moment.
      </p>
    );
  }
  return (
    <ul className="grid gap-md sm:grid-cols-2" aria-label="Ticket codes">
      {codes.map((ticket) => (
        <li
          key={ticket.code}
          className="grid justify-items-center gap-sm rounded-lg border border-line bg-canvas p-md text-center"
        >
          <span className="rounded-md bg-white p-sm">
            <QRCodeSVG value={ticket.code} size={144} aria-label={`QR code for ticket ${ticket.code}`} />
          </span>
          <p className="type-body font-mono font-semibold">{ticket.code}</p>
          <p className="type-caption text-muted-text">{ticket.tierName}</p>
          {ticket.status === "checked_in" ? (
            <Badge variant="neutral">Checked in</Badge>
          ) : (
            <Badge variant="accent">Valid for entry</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
