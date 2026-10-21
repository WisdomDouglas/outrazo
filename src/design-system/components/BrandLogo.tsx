import darkLogo from "@/assets/outrazo-symbol-dark.png";
import lightLogo from "@/assets/outrazo-symbol-light.png";

/** The supplied Outrazo symbol, paired with its event-focused wordmark. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-logo inline-flex min-w-0 items-center whitespace-nowrap">
      <span className="brand-logo-mark relative inline-flex shrink-0 items-center justify-center" aria-hidden="true">
        <img src={darkLogo} alt="" className="brand-logo-dark h-full w-full object-contain" />
        <img src={lightLogo} alt="" className="brand-logo-light h-full w-full object-contain" />
      </span>
      {!compact && (
        <span className="brand-logo-name font-display font-bold text-primary-text">
          OUTR<span className="brand-logo-a">A</span>ZO
        </span>
      )}
    </span>
  );
}