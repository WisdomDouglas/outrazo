import darkLogo from "@/assets/outrazo-logo-dark.png.asset.json";
import lightLogo from "@/assets/outrazo-logo-light.png.asset.json";

/** The supplied Outrazo symbol, paired with the existing type treatment. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-sm whitespace-nowrap">
      <span className="relative inline-flex h-8 w-7 shrink-0 items-center justify-center" aria-hidden="true">
        <img src={darkLogo.url} alt="" className="brand-logo-dark h-full w-full object-contain" />
        <img src={lightLogo.url} alt="" className="brand-logo-light h-full w-full object-contain" />
      </span>
      {!compact && <span className="font-display font-bold text-primary-text">OUTRAZO<span className="text-accent">.</span></span>}
    </span>
  );
}