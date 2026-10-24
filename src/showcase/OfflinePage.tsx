import { Button } from "@/design-system/components/Button";
import { BrandLogo } from "@/design-system/components/BrandLogo";

export function OfflinePage({ online, onRetry }: { online: boolean; onRetry: () => void }) {
  return (
    <main className="offline-page" role="alert">
      <div className="offline-page__glow" aria-hidden="true" />
      <section className="offline-page__card">
        <BrandLogo />
        <div className="offline-page__art" aria-hidden="true">
          <span className="offline-page__orbit offline-page__orbit--outer" />
          <span className="offline-page__orbit offline-page__orbit--inner" />
          <span className="offline-page__signal">!</span>
        </div>
        <p className="offline-page__eyebrow">A LITTLE PAUSE IN THE PLANS</p>
        <h1 className="type-h1">You’re offline.</h1>
        <p className="type-body-lg text-muted-text">
          {online
            ? "Your connection is back. Let’s get you back to discovering."
            : "Looks like the internet took a quick detour. Check your connection and we’ll be right here."}
        </p>
        <Button type="button" size="lg" onClick={onRetry}>
          {online ? "Back to Outrazo" : "Check connection"}
        </Button>
      </section>
    </main>
  );
}
