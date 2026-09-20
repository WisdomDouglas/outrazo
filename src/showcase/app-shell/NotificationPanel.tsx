import { CheckCircle2, Clock3, Sparkles } from "lucide-react";

const NOTIFICATIONS = [
  { icon: CheckCircle2, text: "Your RSVP for Tech Connect is confirmed.", time: "2h" },
  { icon: Sparkles, text: "New event from an organizer you follow.", time: "5h" },
  { icon: Clock3, text: "Your saved event starts tomorrow.", time: "1d" },
];

export function NotificationPanel() {
  return (
    <section className="fixed right-md top-20 z-50 w-[min(calc(100vw-var(--spacing-xl)),360px)] rounded-lg border border-line bg-card p-sm shadow-card sm:absolute sm:right-0 sm:top-[calc(100%+var(--spacing-sm))]" aria-label="Notifications">
      <div className="flex items-center justify-between px-sm py-sm">
        <h2 className="type-h3">Notifications</h2>
        <span className="type-caption text-muted-text">Demo</span>
      </div>
      <div className="flex flex-col">
        {NOTIFICATIONS.map(({ icon: Icon, text, time }) => (
          <div key={text} className="flex gap-sm border-t border-line px-sm py-md">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/12 text-accent"><Icon aria-hidden className="size-4" /></span>
            <p className="type-body min-w-0 flex-1">{text}</p>
            <span className="type-caption shrink-0 text-subtle-text">{time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}