import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, FolderKanban, ScanLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/design-system/components/Button";
import { EmptyState } from "@/design-system/components/EmptyState";
import { ErrorState } from "@/design-system/components/ErrorState";
import { Skeleton } from "@/design-system/components/Skeleton";
import { useAccessToken } from "@/showcase/admin/admin-client";
import { useOrganizerEvents } from "@/showcase/organizer/use-organizer-events";
import { checkInTicket, type CheckInResult } from "@/showcase/organizer/organizer-reports";
import { normalizeTicketCode } from "@/showcase/tickets/ticket-codes";

export const Route = createFileRoute("/app/organizer/checkin")({
  head: () => ({ meta: [
    { title: "Check-in — Organizer Dashboard — Outrazo" },
    { name: "description", content: "Scan or enter ticket codes to check guests in." },
  ] }),
  component: OrganizerCheckinPage,
});

interface RecentCheckIn {
  code: string;
  outcome: CheckInResult["outcome"] | "error";
  detail: string;
  at: string;
}

function friendlyError(caught: unknown): string {
  if (caught instanceof Error && caught.message) return caught.message;
  return "Something went wrong. Please try again.";
}

function OrganizerCheckinPage() {
  const { events, loading: eventsLoading, error: eventsError, refresh: refreshEvents } = useOrganizerEvents();
  const token = useAccessToken();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualCode, setManualCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ code: string; data: CheckInResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentCheckIn[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const checkingRef = useRef(false);

  const activeId = selectedId ?? events[0]?.id ?? null;

  const validateCode = useCallback(
    async (raw: string) => {
      if (!token || !activeId || checkingRef.current) return;
      const normalized = normalizeTicketCode(raw);
      if (!normalized.ok) {
        setError(normalized.error);
        return;
      }
      checkingRef.current = true;
      setChecking(true);
      setError(null);
      setResult(null);
      try {
        const data = await checkInTicket({
          data: { eventId: activeId, code: normalized.code },
          headers: { Authorization: `Bearer ${token}` },
        });
        setResult({ code: normalized.code, data });
        setRecent((current) =>
          [
            {
              code: normalized.code,
              outcome: data.outcome,
              detail:
                data.outcome === "checked_in"
                  ? `${data.tierName} · ${new Date(data.checkedInAt).toLocaleTimeString()}`
                  : `${data.tierName} · already in since ${new Date(data.checkedInAt).toLocaleTimeString()}`,
              at: new Date().toISOString(),
            },
            ...current,
          ].slice(0, 10),
        );
      } catch (caught: unknown) {
        const message = friendlyError(caught);
        setError(message);
        setRecent((current) =>
          [{ code: normalized.code, outcome: "error" as const, detail: message, at: new Date().toISOString() }, ...current].slice(0, 10),
        );
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    [activeId, token],
  );

  // Camera lifecycle: start on entering scan mode, stop on leaving. The
  // library loads lazily so the scanner bundle never weighs other pages.
  useEffect(() => {
    if (mode !== "scan" || !activeId) return;
    let cancelled = false;
    setCameraError(null);
    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("outrazo-checkin-scanner");
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            void validateCode(decodedText);
          },
          undefined,
        );
      } catch (caught: unknown) {
        if (cancelled) return;
        setCameraError(
          "The camera could not start (it needs HTTPS or localhost plus permission). Enter codes manually instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner.stop().then(
          () => scanner.clear(),
          () => scanner.clear(),
        );
      }
    };
  }, [activeId, mode, validateCode]);

  if (eventsLoading) {
    return (
      <div className="grid gap-md" aria-label="Loading your events">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (eventsError) {
    return <ErrorState title="We couldn't load your events." description={eventsError} onRetry={refreshEvents} />;
  }

  if (events.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban aria-hidden className="size-5" />}
        title="No events yet."
        description="Create an event first — its door check-in opens here."
        action={
          <Link to="/app/create-event" className="focus-ring rounded-full">
            <Button leadingIcon={<CalendarPlus aria-hidden className="size-4" />}>Create an event</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid max-w-xl gap-lg">
      <div>
        <h2 className="type-h2">Check-in</h2>
        <p className="type-body mt-xs text-muted-text">
          Scan or enter ticket codes at the door. Each code checks in exactly once — replays show the original entry.
        </p>
      </div>

      <label className="grid gap-sm">
        <span className="type-caption text-muted-text">Event</span>
        <select
          value={activeId ?? ""}
          onChange={(selectEvent) => {
            setSelectedId(selectEvent.currentTarget.value || null);
            setResult(null);
            setError(null);
          }}
          className="type-body h-12 rounded-md border border-line bg-card px-md text-primary-text outline-none focus:border-accent"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>{event.details.title}</option>
          ))}
        </select>
      </label>

      <div className="flex gap-xs" role="group" aria-label="Check-in method">
        <Button type="button" variant={mode === "scan" ? "primary" : "outline"} size="sm" onClick={() => setMode("scan")}>
          Scan camera
        </Button>
        <Button type="button" variant={mode === "manual" ? "primary" : "outline"} size="sm" onClick={() => setMode("manual")}>
          Enter code
        </Button>
      </div>

      {mode === "scan" ? (
        <div className="grid gap-sm">
          {cameraError ? (
            <ErrorState title="Camera unavailable." description={cameraError} onRetry={() => setMode("manual")} />
          ) : (
            <div className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
              <div id="outrazo-checkin-scanner" className="min-h-64 w-full" />
            </div>
          )}
          {checking ? (
            <p className="type-body text-muted-text" role="status">Validating ticket…</p>
          ) : null}
        </div>
      ) : (
        <form
          className="grid gap-sm"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            void validateCode(manualCode);
          }}
        >
          <label className="type-body grid gap-xs font-semibold" htmlFor="checkin-code">
            Ticket code
            <input
              id="checkin-code"
              type="text"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="TKT-XXXXXXXXXX"
              autoComplete="off"
              autoCapitalize="characters"
              className="type-body focus-ring rounded-md border border-line bg-card px-md py-sm font-mono font-normal"
            />
          </label>
          <div>
            <Button type="submit" loading={checking} disabled={checking}>
              Check in
            </Button>
          </div>
        </form>
      )}

      {error ? (
        <p className="type-body rounded-lg border border-line bg-card px-md py-sm text-transactional" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <div
          className={`grid gap-xs rounded-lg border p-md ${result.data.outcome === "checked_in" ? "border-accent/40 bg-accent/10" : "border-line bg-card"}`}
          role="status"
        >
          <p className="type-h3 flex items-center gap-sm">
            <ScanLine aria-hidden className="size-5" />
            {result.data.outcome === "checked_in" ? "Checked in" : "Already checked in"}
          </p>
          <p className="type-body">
            {result.code} · {result.data.tierName}
            {result.data.orderReference ? ` · order ${result.data.orderReference}` : ""}
          </p>
          <p className="type-caption text-muted-text">
            {result.data.outcome === "checked_in" ? "Entered " : "First entered "}
            {new Date(result.data.checkedInAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      {recent.length > 0 ? (
        <div className="grid gap-sm">
          <h3 className="type-h3">This session</h3>
          <ul className="grid gap-xs">
            {recent.map((entry) => (
              <li key={`${entry.code}-${entry.at}`} className="type-body flex items-center justify-between gap-sm rounded-md border border-line bg-card px-md py-sm">
                <span className="font-mono">{entry.code}</span>
                <span className={entry.outcome === "checked_in" ? "text-accent" : entry.outcome === "already_checked_in" ? "text-muted-text" : "text-transactional"}>
                  {entry.outcome === "checked_in" ? "Checked in" : entry.outcome === "already_checked_in" ? "Duplicate" : "Rejected"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
