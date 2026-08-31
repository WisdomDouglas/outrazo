import { Badge } from "@/design-system/components/Badge";

const photo = (id: string, w = 500) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

function PhotoCard({
  src,
  alt,
  label,
  meta,
  badge,
}: {
  src: string;
  alt: string;
  label: string;
  meta: string;
  badge?: React.ReactNode;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line-strong bg-card/95 shadow-floating backdrop-blur-md">
      <div className="relative">
        <img src={src} alt={alt} loading="lazy" className="aspect-[4/3] w-full object-cover" />
        {badge ? <div className="absolute left-sm top-sm">{badge}</div> : null}
      </div>
      <figcaption className="p-md">
        <p className="type-h3 truncate text-primary-text">{label}</p>
        <p className="type-caption truncate text-muted-text">{meta}</p>
      </figcaption>
    </figure>
  );
}

const NIGHT_MARKET = {
  src: photo("photo-1514525253161-7a46d19cd819"),
  alt: "Crowd dancing at a night concert",
  label: "Night Market",
  meta: "Fri · Freedom Park",
};

const BUILD_WEEK = {
  src: photo("photo-1505373877841-8d25f7d46678"),
  alt: "Speaker presenting at a tech meetup",
  label: "Build Week",
  meta: "Sun · Ikeja Hub",
};

/**
 * Desktop: the same two event cards as mobile, tilted and drifting in the lower
 * hero (city band), clear of the headline, search and CTAs.
 */
export function HeroFloatingCards() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[6%] hidden lg:block">
      <div className="mx-auto flex max-w-[1200px] items-end justify-between">
        <div
          className="outrazo-float w-[216px] xl:w-[236px]"
          style={{ ["--tilt" as string]: "-5deg" }}
        >
          <PhotoCard {...NIGHT_MARKET} badge={<Badge variant="transactional">Live</Badge>} />
        </div>
        <div
          className="outrazo-float w-[216px] xl:w-[236px]"
          style={{ ["--tilt" as string]: "5deg", animationDelay: "-3s" }}
        >
          <PhotoCard {...BUILD_WEEK} />
        </div>
      </div>
    </div>
  );
}

/** Mobile/tablet strip: the same two tilted, drifting event cards. */
export function HeroCardStrip() {
  return (
    <div className="relative z-10 flex w-full items-center justify-center gap-md lg:hidden">
      <div className="outrazo-float w-[46%] max-w-[190px]" style={{ ["--tilt" as string]: "-6deg" }}>
        <PhotoCard
          {...NIGHT_MARKET}
          src={photo("photo-1514525253161-7a46d19cd819", 400)}
          meta="Fri · Lagos"
          badge={<Badge variant="transactional">Live</Badge>}
        />
      </div>
      <div
        className="outrazo-float w-[46%] max-w-[190px]"
        style={{ ["--tilt" as string]: "7deg", animationDelay: "-2.2s" }}
      >
        <PhotoCard {...BUILD_WEEK} src={photo("photo-1505373877841-8d25f7d46678", 400)} meta="Sun · Ikeja" />
      </div>
    </div>
  );
}
