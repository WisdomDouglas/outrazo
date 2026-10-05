import { Compass, Plus } from "lucide-react";

const QUESTIONS = [
  {
    number: "01",
    question: "What can I discover on Outrazo?",
    answer: "Browse sample event listings by category or city, search for a specific kind of outing, and open each event to see its date, venue, organizer, price and available ticket options.",
  },
  {
    number: "02",
    question: "Do I need an account to explore events?",
    answer: "No. You can browse events and open event details without signing in. An account is needed when you want saved events to follow you across devices.",
  },
  {
    number: "03",
    question: "Can I buy tickets or RSVP right now?",
    answer: "Ticketing and RSVP are currently a preview experience. No payment is taken and no valid entry pass is issued, so always confirm attendance directly with the organizer.",
  },
  {
    number: "04",
    question: "Where do I find the venue and final event details?",
    answer: "Open the event page for its listed venue, address, date, time and organizer. Details can change, so check with the organizer before travelling.",
  },
  {
    number: "05",
    question: "Can I save an event for later?",
    answer: "Yes. Sign in and use the save control on an event card or event page. Your Saved page keeps those events together so they are easy to revisit.",
  },
  {
    number: "06",
    question: "Can organizers publish events yet?",
    answer: "The organizer flow is currently a preview. You can explore how it works, but submissions are not published live yet.",
  },
] as const;

export function LandingFaq() {
  return (
    <section aria-labelledby="faq-title" className="landing-faq overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-md py-section lg:px-xl">
        <div className="grid gap-2xl lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-3xl">
          <header className="landing-faq-intro lg:sticky lg:top-2xl lg:self-start">
            <div className="mb-lg grid size-12 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent">
              <Compass aria-hidden className="size-5" strokeWidth={2} />
            </div>
            <p className="type-caption mb-sm font-semibold text-accent">GOOD TO KNOW</p>
            <h2 id="faq-title" className="type-h2 max-w-[17ch] text-balance">Clear answers before you make a plan.</h2>
            <p className="type-body-lg mt-md max-w-[34ch] text-muted-text">What is live, what is still a preview, and how to explore with confidence.</p>
          </header>

          <div className="landing-faq-list border-t border-line">
            {QUESTIONS.map(({ number, question, answer }, index) => (
              <details key={question} className="landing-faq-item group border-b border-line" open={index === 0}>
                <summary className="focus-ring grid min-h-20 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-md rounded-sm py-md marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="type-caption font-semibold text-accent">{number}</span>
                  <span className="type-body-lg min-w-0 font-semibold text-primary-text">{question}</span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-accent transition-colors group-hover:border-accent" aria-hidden>
                    <Plus className="size-4 transition-transform duration-300 group-open:rotate-45" strokeWidth={2} />
                  </span>
                </summary>
                <div className="landing-faq-answer grid grid-cols-[auto_minmax(0,1fr)_auto] gap-md pb-lg">
                  <span className="type-caption invisible" aria-hidden>{number}</span>
                  <p className="type-body-lg max-w-[62ch] text-muted-text">{answer}</p>
                  <span className="size-11" aria-hidden />
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}