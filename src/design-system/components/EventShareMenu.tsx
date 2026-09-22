import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "./Button";

export function EventShareMenu({
  title,
  copiedLabel = "Event link copied",
  menuLabel = "Share event",
}: {
  title: string;
  /** Confirmation copy shown after the link is copied. */
  copiedLabel?: string;
  /** Accessible name for the share menu. */
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const url = typeof window === "undefined" ? "" : window.location.href;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    setOpen((value) => !value);
  };

  return (
    <div ref={rootRef} className="relative">
      <Button type="button" variant="outline" size="sm" leadingIcon={<Share2 aria-hidden className="size-4" />} onClick={nativeShare} aria-expanded={open}>
        Share
      </Button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+var(--spacing-sm))] z-30 w-56 rounded-md border border-line bg-elevated p-sm shadow-floating" role="menu" aria-label={menuLabel}>
          <button type="button" role="menuitem" onClick={copy} className="focus-ring type-body flex min-h-11 w-full items-center gap-sm rounded-sm px-md text-left hover:bg-primary-text/8">
            {copied ? <Check aria-hidden className="size-4 text-accent" /> : <Copy aria-hidden className="size-4" />}
            {copied ? copiedLabel : "Copy link"}
          </button>
          <a role="menuitem" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`} className="focus-ring type-body flex min-h-11 items-center gap-sm rounded-sm px-md hover:bg-primary-text/8">WhatsApp</a>
          <a role="menuitem" target="_blank" rel="noreferrer" href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`} className="focus-ring type-body flex min-h-11 items-center gap-sm rounded-sm px-md hover:bg-primary-text/8">X</a>
          <a role="menuitem" target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} className="focus-ring type-body flex min-h-11 items-center gap-sm rounded-sm px-md hover:bg-primary-text/8">Facebook</a>
        </div>
      ) : null}
      <span className="sr-only" aria-live="polite">{copied ? copiedLabel : ""}</span>
    </div>
  );
}
