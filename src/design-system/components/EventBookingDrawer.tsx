import { useNavigate, useRouter } from "@tanstack/react-router";
import { Check, Minus, Plus, Ticket, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/showcase/auth/auth-context";
import type { EventDetails } from "@/showcase/sample-data";
import { cancelReservation, createReservation, fetchReservation } from "@/showcase/rsvp/rsvp";
import { classifyReservationError } from "@/showcase/rsvp/reservation-helpers";
import { isDatabaseEventId, rememberReturnTo } from "@/showcase/saved/saved-events-store";
import { Button } from "./Button";
import { DemoTicket } from "./DemoTicket";
import { cn } from "../lib/utils";

const money = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

type Step = "select" | "success" | "ticket";
type FreeState = "checking" | "none" | "reserved" | "working" | "error";

interface EventBookingDrawerProps {
  event: EventDetails;
  open: boolean;
  onClose: () => void;
  /** Called after a reservation is created or cancelled so counts can refresh. */
  onReservationsChanged?: () => void;
}

export function EventBookingDrawer({ event, open, onClose, onReservationsChanged }: EventBookingDrawerProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [step, setStep] = useState<Step>("select");
  const [tierId, setTierId] = useState(event.ticketTiers[0]?.id ?? "rsvp");
  const [quantity, setQuantity] = useState(1);
  const [freeState, setFreeState] = useState<FreeState>("checking");
  const [freeError, setFreeError] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const paid = event.ticketTiers.length > 0;
  const tier = event.ticketTiers.find((item) => item.id === tierId) ?? event.ticketTiers[0];
  const isDbEvent = isDatabaseEventId(event.id);
  const isCancelled = event.status === "cancelled";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) window.setTimeout(() => {
      setStep("select");
      setFreeState("checking");
      setFreeError(null);
      setCancelledNotice(false);
    }, 250);
  }, [open]);

  useEffect(() => {
    if (!open || paid || !isDbEvent || isCancelled || authLoading) return;
    if (!userId) {
      setFreeState("none");
      return;
    }
    let active = true;
    setFreeState("checking");
    setFreeError(null);
    fetchReservation(event.id, userId).then(
      (row) => { if (active) setFreeState(row ? "reserved" : "none"); },
      (caught: unknown) => {
        if (!active) return;
        setFreeError(classifyReservationError(caught, "reserve").message);
        setFreeState("error");
      },
    );
    return () => { active = false; };
  }, [attempt, authLoading, event.id, isCancelled, isDbEvent, open, paid, userId]);

  const goToLogin = () => {
    rememberReturnTo(`/events/${event.id}`);
    onClose();
    void navigate({ to: "/login" });
  };

  const viewTickets = () => {
    onClose();
    void navigate({ to: "/app/tickets" });
  };

  const confirmRsvp = async () => {
    if (!userId) return;
    setFreeState("working");
    setFreeError(null);
    setCancelledNotice(false);
    try {
      await createReservation(event.id, userId);
      setFreeState("reserved");
      router.invalidate();
      onReservationsChanged?.();
    } catch (caught: unknown) {
      const failure = classifyReservationError(caught, "reserve");
      if (failure.kind === "already-reserved") {
        // A second tap (or device) won the race; the spot is still saved.
        setFreeState("reserved");
        router.invalidate();
        onReservationsChanged?.();
      } else {
        setFreeError(failure.message);
        setFreeState("error");
      }
    }
  };

  const cancelRsvp = async () => {
    if (!userId) return;
    setFreeState("working");
    setFreeError(null);
    try {
      await cancelReservation(event.id, userId);
      setFreeState("none");
      setCancelledNotice(true);
      router.invalidate();
      onReservationsChanged?.();
    } catch (caught: unknown) {
      setFreeError(classifyReservationError(caught, "cancel").message);
      setFreeState("error");
    }
  };

  if (!open) return null;

  const renderFreeBody = () => {
    if (!isDbEvent) {
      return (
        <div className="flex flex-col items-center gap-lg py-lg text-center"><span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent"><Ticket aria-hidden className="size-6" /></span><div><h3 className="type-h3">This is a demo event.</h3><p className="type-body mt-sm text-muted-text">Demo events don&apos;t accept reservations. Find a live event to RSVP.</p></div><Button className="w-full" variant="outline" onClick={onClose}>Done</Button></div>
      );
    }
    if (isCancelled) {
      return (
        <div className="flex flex-col items-center gap-lg py-lg text-center"><span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent"><Ticket aria-hidden className="size-6" /></span><div><h3 className="type-h3">This event was cancelled.</h3><p className="type-body mt-sm text-muted-text">The organizer cancelled this event, so RSVPs are closed.</p></div><Button className="w-full" variant="outline" onClick={onClose}>Done</Button></div>
      );
    }
    if (authLoading || freeState === "checking") {
      return <div className="grid place-items-center gap-md py-lg" aria-busy="true"><p className="type-body text-muted-text">Checking your reservation…</p></div>;
    }
    if (!userId) {
      return (
        <div className="flex flex-col items-center gap-lg py-lg text-center"><span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent"><Ticket aria-hidden className="size-6" /></span><div><h3 className="type-h3">Sign in to RSVP.</h3><p className="type-body mt-sm text-muted-text">{event.date} · {event.time}<br />{event.venue.name}, {event.city}</p></div><Button className="w-full" onClick={goToLogin}>Sign in</Button><Button className="w-full" variant="ghost" onClick={onClose}>Not now</Button></div>
      );
    }
    if (freeState === "reserved") {
      return (
        <div className="flex flex-col items-center gap-lg py-lg text-center">
          <span className="grid size-16 place-items-center rounded-full bg-accent text-on-accent"><Check aria-hidden className="size-8" /></span>
          <div><h3 className="type-h2">You&apos;re going!</h3><p className="type-body-lg mt-sm text-muted-text">Your spot is saved on your account.</p></div>
          <dl className="grid w-full gap-sm rounded-md border border-line bg-card p-md text-left type-body"><div><dt className="text-muted-text">Date</dt><dd>{event.date} · {event.time}</dd></div><div><dt className="text-muted-text">Location</dt><dd>{event.venue.name}</dd></div><div><dt className="text-muted-text">Reservation</dt><dd>Free RSVP</dd></div></dl>
          <Button className="w-full" leadingIcon={<Ticket aria-hidden className="size-4" />} onClick={viewTickets}>View my tickets</Button>
          <Button className="w-full" variant="outline" onClick={() => void cancelRsvp()}>Cancel reservation</Button>
        </div>
      );
    }
    if (freeState === "working") {
      return <div className="grid place-items-center gap-md py-lg" aria-busy="true"><Button className="w-full" loading disabled>Reserving your spot…</Button></div>;
    }
    if (freeState === "error") {
      return (
        <div className="flex flex-col items-center gap-lg py-lg text-center">
          <p className="type-body text-transactional" role="alert">{freeError ?? "Something went wrong."}</p>
          <Button className="w-full" variant="outline" onClick={() => setAttempt((current) => current + 1)}>Try again</Button>
          <Button className="w-full" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-lg py-lg text-center">
        {cancelledNotice ? <p className="type-body" role="status">Reservation cancelled.</p> : null}
        <span className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent"><Ticket aria-hidden className="size-6" /></span>
        <div><h3 className="type-h3">You&apos;re one tap away.</h3><p className="type-body mt-sm text-muted-text">{event.date} · {event.time}<br />{event.venue.name}, {event.city}</p></div>
        <Button className="w-full" onClick={() => void confirmRsvp()}>Confirm RSVP</Button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/75 backdrop-blur-sm sm:items-center sm:p-lg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="booking-title" className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg border border-line bg-elevated shadow-floating sm:max-w-[560px] sm:rounded-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-elevated px-lg py-md">
          <div><p className="type-caption text-accent">{step === "ticket" ? "YOUR TICKET" : paid ? "GET TICKETS" : "RSVP"}</p><h2 id="booking-title" className="type-h3 mt-xs">{event.title}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close booking" className="focus-ring grid size-11 place-items-center rounded-full hover:bg-primary-text/8"><X aria-hidden className="size-5" /></button>
        </div>
        <div className="p-lg">
          {step === "ticket" ? <DemoTicket event={event} ticketType={tier?.name ?? "RSVP"} /> : step === "success" ? (
            <div className="flex flex-col items-center gap-lg py-lg text-center">
              <span className="grid size-16 place-items-center rounded-full bg-accent text-on-accent"><Check aria-hidden className="size-8" /></span>
              <div><h3 className="type-h2">You&apos;re going!</h3><p className="type-body-lg mt-sm text-muted-text">Your spot has been reserved.</p></div>
              <dl className="grid w-full gap-sm rounded-md border border-line bg-card p-md text-left type-body"><div><dt className="text-muted-text">Date</dt><dd>{event.date} · {event.time}</dd></div><div><dt className="text-muted-text">Location</dt><dd>{event.venue.name}</dd></div><div><dt className="text-muted-text">Reservation</dt><dd>{paid ? `${quantity} × ${tier?.name}` : "Free RSVP"}</dd></div></dl>
              <p className="type-caption text-muted-text">Demo reservation only. No payment has been processed.</p>
              <Button className="w-full" leadingIcon={<Ticket aria-hidden className="size-4" />} onClick={() => setStep("ticket")}>View My Ticket</Button>
            </div>
          ) : paid ? (
            <div className="flex flex-col gap-lg">
              <div className="type-body rounded-md border border-line bg-card p-md text-muted-text">{event.date} · {event.time}<br />{event.venue.name}, {event.city}</div>
              <fieldset><legend className="type-caption mb-sm text-muted-text">SELECT TICKET</legend><div className="grid gap-sm">{event.ticketTiers.map((item) => <button key={item.id} type="button" onClick={() => setTierId(item.id)} className={cn("focus-ring flex min-h-16 items-center justify-between rounded-md border bg-card px-md text-left transition-colors", tierId === item.id ? "border-transactional" : "border-line hover:border-line-strong")}><span><strong className="type-body block">{item.name}</strong>{item.description ? <span className="type-caption text-muted-text">{item.description}</span> : null}</span><strong className="type-body text-transactional">{money(item.price)}</strong></button>)}</div></fieldset>
              <div className="flex items-center justify-between border-y border-line py-md"><span className="type-body">Quantity</span><div className="flex items-center gap-md"><button type="button" aria-label="Decrease quantity" disabled={quantity === 1} onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="focus-ring grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Minus aria-hidden className="size-4" /></button><strong className="type-body w-5 text-center">{quantity}</strong><button type="button" aria-label="Increase quantity" disabled={quantity === 6} onClick={() => setQuantity((q) => Math.min(6, q + 1))} className="focus-ring grid size-11 place-items-center rounded-full border border-line disabled:opacity-40"><Plus aria-hidden className="size-4" /></button></div></div>
              <div className="flex items-center justify-between"><span className="type-body text-muted-text">Total</span><strong className="type-h3 text-transactional">{money((tier?.price ?? 0) * quantity)}</strong></div>
              <Button variant="transactional" className="w-full" onClick={() => setStep("success")}>Continue</Button>
              <p className="type-caption text-center text-muted-text">Demo checkout — you will not be charged.</p>
            </div>
          ) : renderFreeBody()}
        </div>
      </section>
    </div>
  );
}
