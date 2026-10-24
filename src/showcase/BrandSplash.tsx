import { BrandLogo } from "@/design-system/components/BrandLogo";

export function BrandSplash({ message = "Getting your Outrazo ready" }: { message?: string }) {
  return (
    <main className="brand-splash" role="status" aria-live="polite" aria-busy="true">
      <div className="brand-splash__glow" aria-hidden="true" />
      <div className="brand-splash__content">
        <div className="brand-splash__mark">
          <BrandLogo compact />
        </div>
        <p className="brand-splash__wordmark">OUTRAZO</p>
        <p className="brand-splash__message">{message}</p>
        <span className="brand-splash__progress" aria-hidden="true" />
      </div>
    </main>
  );
}
