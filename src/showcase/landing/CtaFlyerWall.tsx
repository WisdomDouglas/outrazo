import { CalendarCheck, MapPin, TicketCheck, Ticket, UsersRound } from "lucide-react";

export function CtaFlyerWall() {
  return (
    <div
      aria-hidden
      className="cta-mascot-window relative -mx-md h-[calc(var(--spacing-section)*3.25)] overflow-hidden sm:mx-0 sm:h-[calc(var(--spacing-section)*3.75)] lg:h-[calc(var(--spacing-section)*5.25)]"
    >
      <div className="cta-mascot-halo" />
      <div className="cta-mascot-orbit cta-mascot-orbit-a">
        <span className="cta-mascot-object cta-mascot-object-calendar">
          <CalendarDays aria-hidden />
          <small>Tonight</small>
        </span>
      </div>
      <div className="cta-mascot-orbit cta-mascot-orbit-b">
        <span className="cta-mascot-object cta-mascot-object-place">
          <MapPin aria-hidden />
          <small>Lagos</small>
        </span>
      </div>
      <div className="cta-mascot-orbit cta-mascot-orbit-c">
        <span className="cta-mascot-object cta-mascot-object-ticket">
          <Ticket aria-hidden />
          <small>Admit one</small>
        </span>
      </div>
      <div className="cta-mascot-mascot">
        <span className="cta-mascot-arm cta-mascot-arm-left" />
        <span className="cta-mascot-arm cta-mascot-arm-right" />
        <div className="cta-mascot-ticket">
          <span className="cta-mascot-ticket-notch cta-mascot-ticket-notch-left" />
          <span className="cta-mascot-ticket-notch cta-mascot-ticket-notch-right" />
          <span className="cta-mascot-ticket-brand">OUTRAZO</span>
          <span className="cta-mascot-ticket-title">Find your<br />next thing.</span>
          <span className="cta-mascot-face">
            <span />
            <span />
          </span>
          <span className="cta-mascot-smile" />
        </div>
        <span className="cta-mascot-foot cta-mascot-foot-left" />
        <span className="cta-mascot-foot cta-mascot-foot-right" />
      </div>
      <div className="cta-mascot-sparkle cta-mascot-sparkle-a"><CalendarCheck aria-hidden /></div>
      <div className="cta-mascot-sparkle cta-mascot-sparkle-b"><TicketCheck aria-hidden /></div>
      <div className="cta-mascot-sparkle cta-mascot-sparkle-c"><UsersRound aria-hidden /></div>
      <div className="cta-mascot-caption">
        <span>Good things are happening</span>
        <span className="cta-mascot-caption-dot" />
        <span>Come find yours</span>
      </div>
    </div>
  );
}
