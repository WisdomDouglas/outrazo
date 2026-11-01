import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Button } from "@/design-system/components/Button";
import { useAuth } from "@/showcase/auth/auth-context";
import { rememberReturnTo } from "@/showcase/saved/saved-events-store";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_DESCRIPTIONS,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from "./report-reasons";
import { fileEventReport } from "./report-functions";

interface ReportEventDialogProps {
  eventId: string;
  eventTitle: string;
  open: boolean;
  onClose: () => void;
}

/** Public "Report this event" dialog. Filing is rate-limited server-side and
 * advisory-only: it never changes the event, it only queues a staff review.
 * Overlay, panel, and close behaviors mirror EventBookingDrawer so every
 * utility class here is already proven on this same page. */
export function ReportEventDialog({ eventId, eventTitle, open, onClose }: ReportEventDialogProps) {
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setReason(null);
    setDetails("");
    setError(null);
    setSubmitted(false);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [close, open]);

  if (!open) return null;

  const token = session?.access_token ?? null;

  const submit = async () => {
    if (!token || !reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await fileEventReport({
        data: {
          eventId,
          reason,
          details: details.trim() ? details.trim() : undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit the report. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/75 backdrop-blur-sm sm:items-center sm:p-lg"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-event-title"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg border border-line bg-elevated shadow-floating sm:max-w-[560px] sm:rounded-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-md border-b border-line bg-elevated px-lg py-md">
          <div>
            <p className="type-caption text-accent">REPORT</p>
            <h2 id="report-event-title" className="type-h3 mt-xs">{eventTitle}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close report dialog" className="focus-ring grid size-11 shrink-0 place-items-center rounded-full hover:bg-primary-text/8"><X aria-hidden className="size-5" /></button>
        </div>

        <div className="grid gap-md p-lg">
          {!token ? (
            <div className="grid gap-md">
              <p className="type-body text-muted-text">
                Sign in to report an event. Our moderation team reviews every report.
              </p>
              <div className="flex flex-wrap gap-xs">
                <Link
                  to="/login"
                  className="focus-ring rounded-full"
                  onClick={() => rememberReturnTo(window.location.pathname)}
                >
                  <Button>Sign in</Button>
                </Link>
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : submitted ? (
            <div className="grid gap-md">
              <p className="type-body" role="status">
                Thank you. Our team will review this event shortly.
              </p>
              <div>
                <Button onClick={close}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-md">
              <fieldset>
                <legend className="type-body font-semibold">
                  What is wrong with this event?
                </legend>
                <div className="mt-sm grid gap-xs" role="radiogroup" aria-label="Report reason">
                  {REPORT_REASONS.map((value) => (
                    <label
                      key={value}
                      className={`focus-ring flex cursor-pointer items-start gap-sm rounded-md border px-md py-sm transition-colors ${reason === value ? "border-accent bg-accent/8" : "border-line"}`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={value}
                        checked={reason === value}
                        onChange={() => setReason(value)}
                        className="mt-xs size-4 shrink-0 accent-accent"
                      />
                      <span>
                        <span className="type-body font-medium">{REPORT_REASON_LABELS[value]}</span>
                        <span className="type-body mt-xs block text-muted-text">
                          {REPORT_REASON_DESCRIPTIONS[value]}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="grid gap-xs" htmlFor="report-details">
                <span className="type-body font-semibold">
                  Details <span className="font-normal text-muted-text">(optional)</span>
                </span>
                <textarea
                  id="report-details"
                  value={details}
                  onChange={(event) => setDetails(event.target.value.slice(0, REPORT_DETAILS_MAX))}
                  rows={3}
                  maxLength={REPORT_DETAILS_MAX}
                  placeholder="Anything that helps our team review this event…"
                  className="type-body focus-ring min-h-20 rounded-md border border-line bg-canvas px-md py-sm"
                />
                <span className="type-caption text-muted-text" role="status">
                  {details.length}/{REPORT_DETAILS_MAX}
                </span>
              </label>

              {error ? (
                <p className="type-body rounded-md border border-line bg-canvas px-md py-sm" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-xs">
                <Button disabled={!reason} loading={submitting} onClick={() => void submit()}>
                  Submit report
                </Button>
                <Button variant="ghost" disabled={submitting} onClick={close}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
