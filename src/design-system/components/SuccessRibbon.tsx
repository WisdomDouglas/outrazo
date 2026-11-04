// Floating payment-success ribbon. Mounts on the payment return pages when
// the server confirms money moved, rests for exactly SUCCESS_RIBBON_MS,
// then falls away and unmounts itself. Clicking dismisses early. Motion
// degrades to plain fades under prefers-reduced-motion (see styles.css).
import { useEffect, useRef, useState } from "react";

/** Milliseconds the ribbon stays fully visible before exiting. */
export const SUCCESS_RIBBON_MS = 5000;
/** Must match the success-ribbon-exit keyframe duration in styles.css. */
const EXIT_MS = 450;

export function SuccessRibbon({
  message = "Payment successful!",
  detail,
  durationMs = SUCCESS_RIBBON_MS,
  onDone,
}: {
  message?: string;
  detail?: string;
  durationMs?: number;
  onDone?: () => void;
}) {
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    timers.current.push(setTimeout(() => setExiting(true), durationMs));
    timers.current.push(
      setTimeout(() => {
        setGone(true);
        doneRef.current?.();
      }, durationMs + EXIT_MS),
    );
    return () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    };
  }, [durationMs]);

  if (gone) return null;
  const dismiss = () => {
    if (exiting) return;
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    setExiting(true);
    timers.current.push(
      setTimeout(() => {
        setGone(true);
        doneRef.current?.();
      }, EXIT_MS),
    );
  };

  return (
    <div className={exiting ? "success-ribbon success-ribbon--exiting" : "success-ribbon"}>
      <button
        type="button"
        onClick={dismiss}
        aria-label={`${message} Dismiss`}
        className="success-ribbon__card cursor-pointer text-left"
      >
        <span className="success-ribbon__seal" aria-hidden>
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M2.5 8.5l3.5 3.5 7-8"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="success-ribbon__text">
          <span className="success-ribbon__title" role="status">
            {message}
          </span>
          {detail ? (
            <span className="success-ribbon__detail">{detail}</span>
          ) : null}
        </span>
      </button>
      <div className="success-ribbon__tail" aria-hidden />
    </div>
  );
}
