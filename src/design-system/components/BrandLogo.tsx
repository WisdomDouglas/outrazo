import darkLogo from "@/assets/outrazo-symbol-dark.png";
import lightLogo from "@/assets/outrazo-symbol-light.png";

/** The supplied Outrazo symbol, paired with the existing type treatment. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-sm whitespace-nowrap">
      <span className="brand-logo-mark relative inline-flex size-8 shrink-0 items-center justify-center" aria-hidden="true">
        <img src={darkLogo} alt="" className="brand-logo-dark h-full w-full object-contain" />
        <img src={lightLogo} alt="" className="brand-logo-light h-full w-full object-contain" />
      </span>
      {!compact && <span className="font-display font-bold text-primary-text">OUTRAZO<span className="text-accent">.</span></span>}
    </span>
  );
}