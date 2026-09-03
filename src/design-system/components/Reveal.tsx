import type { ElementType, HTMLAttributes } from "react";

import { cn } from "../lib/utils";
import { useReveal } from "../lib/use-reveal";

export interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  /** Stagger delay in milliseconds. */
  delay?: number;
  /** Replay the animation each time the element re-enters the viewport. */
  repeat?: boolean;
}

/**
 * Wraps content in a gentle fade-and-rise scroll reveal.
 * Motion is skipped automatically under `prefers-reduced-motion`.
 */
export function Reveal({
  as,
  className,
  delay = 0,
  repeat = false,
  style,
  ...props
}: RevealProps) {
  const Component = (as ?? "div") as ElementType;
  const { ref, revealed } = useReveal<HTMLDivElement>({ once: !repeat });

  return (
    <Component
      ref={ref}
      data-revealed={revealed ? "true" : "false"}
      className={cn("ds-reveal", className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
      {...props}
    />
  );
}
