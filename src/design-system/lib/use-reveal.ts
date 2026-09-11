import { useCallback, useEffect, useState } from "react";

/** True when the user has asked for reduced motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export interface UseRevealOptions {
  /** Fraction of the element that must be visible. */
  threshold?: number;
  /** Re-hide the element when it scrolls out of view. */
  once?: boolean;
}

/**
 * Scroll-reveal primitive: attach `ref` to an element and use `revealed`
 * to drive the `data-revealed` attribute consumed by `.ds-reveal`.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.15,
  once = true,
}: UseRevealOptions = {}) {
  const [node, setNode] = useState<T | null>(null);
  // Content is visible by default so SSR, hydration delays, and unsupported
  // observers can never leave an entire section inaccessible.
  const [revealed, setRevealed] = useState(true);
  const ref = useCallback((element: T | null) => setNode(element), []);

  useEffect(() => {
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    // Anything already on screen at mount reveals right away, so content is
    // never left invisible when the observer has nothing to report.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      setRevealed(true);
      if (once) return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setRevealed(false);
          }
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [node, threshold, once]);

  return { ref, revealed };
}
