import { Plus } from "lucide-react";

const QUESTIONS = [
  {
    question: "What can I find on Outrazo?",
    answer: "You can browse the event listings by category or city, search for something specific, and open an event to see its time, venue, organizer, and listed ticket options.",
  },
  {
    question: "Do I need an account to explore events?",
    answer: "No. You can browse event listings and view event details without signing in. Saving events to your account requires sign-in.",
  },
  {
    question: "Can I book tickets or RSVP here?",
    answer: "The current ticket and RSVP experience is a demo. You can preview how it works, but it does not take payment or create a valid entry pass. Check with the organizer before making plans to attend.",
  },
  {
    question: "How do I know where an event is happening?",
    answer: "Open the event page for its listed venue, address, date, and time. You can use Get Directions to open the location in Google Maps. Confirm final details with the organizer before you go.",
  },
  {
    question: "Can I post my own event?",
    answer: "There’s a preview of the organizer flow, but event submissions aren’t live yet. The form currently won’t publish your event.",
  },
] as const;

export function LandingFaq() {
  return (
    <section aria-labelledby="faq-title" className="mx-auto max-w-[1200px] px-md py-section lg:px-xl">
      <div className="grid gap-2xl lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-3xl">
        <div>
          <p className="type-caption mb-sm font-semibold text-accent">GOOD TO KNOW</p>
          <h2 id="faq-title" className="type-h2 max-w-[18ch] text-balance">A few things you might be wondering.</h2>
          <p className="type-body-lg mt-md max-w-[38ch] text-muted-text">The important details, before you head out.</p>
        </div>
        <div className="border-t border-line">
          {QUESTIONS.map(({ question, answer }, index) => (
            <details key={question} className="landing-faq-item group border-b border-line" open={index === 0}>
              <summary className="focus-ring flex min-h-16 cursor-pointer list-none items-center justify-between gap-md rounded-sm py-md marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="type-body-lg font-semibold text-primary-text">{question}</span>
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-accent transition-colors group-hover:border-accent" aria-hidden>
                  <Plus className="size-4 transition-transform duration-300 group-open:rotate-45" strokeWidth={2} />
                </span>
              </summary>
              <p className="landing-faq-answer type-body-lg max-w-[62ch] pb-lg pr-2xl text-muted-text">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}