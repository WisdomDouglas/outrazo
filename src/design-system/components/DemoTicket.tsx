import { Check, QrCode } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import type { EventDetails } from "@/showcase/sample-data";

export function DemoTicket({ event, ticketType }: { event: EventDetails; ticketType: string }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-card shadow-card" aria-label="Demo event ticket">
      <div className="flex items-center justify-between border-b border-line bg-accent/10 px-lg py-md">
        <strong className="type-h3 text-accent"><BrandLogo /></strong>
        <span className="type-caption inline-flex items-center gap-xs rounded-full bg-accent px-sm py-xs font-semibold text-on-accent"><Check aria-hidden className="size-3.5" />CONFIRMED</span>
      </div>
      <div className="grid gap-lg p-lg sm:grid-cols-[1fr_auto] sm:items-center">
        <dl className="grid gap-md">
          <div><dt className="type-caption text-muted-text">EVENT</dt><dd className="type-h3 mt-xs">{event.title}</dd></div>
          <div className="grid grid-cols-2 gap-md">
            <div><dt className="type-caption text-muted-text">DATE & TIME</dt><dd className="type-body mt-xs">{event.date}<br />{event.time}</dd></div>
            <div><dt className="type-caption text-muted-text">VENUE</dt><dd className="type-body mt-xs">{event.venue.name}</dd></div>
            <div><dt className="type-caption text-muted-text">GUEST</dt><dd className="type-body mt-xs">Demo Guest</dd></div>
            <div><dt className="type-caption text-muted-text">TICKET</dt><dd className="type-body mt-xs">{ticketType}</dd></div>
          </div>
        </dl>
        <div className="grid size-32 place-items-center rounded-md border border-line bg-canvas" aria-label="QR code placeholder"><QrCode aria-hidden className="size-20 text-primary-text" /></div>
      </div>
      <p className="type-caption border-t border-dashed border-line px-lg py-sm text-center text-muted-text">Demo ticket — no payment has been processed.</p>
    </section>
  );
}
