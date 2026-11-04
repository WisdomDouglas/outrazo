import type { ReactNode } from "react";

interface SectionHeroProps {
  image: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  navigation?: ReactNode;
  meta?: ReactNode;
}

export function SectionHero({
  image,
  icon,
  eyebrow,
  title,
  description,
  navigation,
  meta,
}: SectionHeroProps) {
  return (
    <section className="section-hero">
      <div aria-hidden="true" className="section-hero-backdrop">
        <img src={image} alt="" className="section-hero-image-dark" />
        <img src={image} alt="" className="section-hero-image-light" />
        <div className="section-hero-veil" />
        <div className="section-hero-fade" />
      </div>
      <div className="section-hero-inner">
        <div className="section-hero-top">
          <div className="section-hero-navigation">{navigation}</div>
          {meta ? <div className="section-hero-meta">{meta}</div> : null}
        </div>
        <div className="section-hero-content">
          <span className="section-hero-icon">{icon}</span>
          <div className="section-hero-copy">
            <p className="section-hero-eyebrow">{eyebrow}</p>
            <h1 className="section-hero-title">{title}</h1>
            <p className="section-hero-description">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
