const steps = [
  { title: "Discover", description: "Search by destination or category, or explore places on the 3D map." },
  { title: "Save and plan", description: "Save your favorites and build an itinerary around the places you want to visit." },
  { title: "Check the details", description: "Check opening times, ownership verification, and availability with each business before traveling." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-cream-50 py-12 md:py-16" aria-labelledby="how-it-works-title">
      <div className="mx-auto max-w-7xl px-6">
        <h2 id="how-it-works-title" className="text-3xl font-bold text-navy-700" style={{ fontFamily: "var(--font-display)" }}>From discovery to a trip plan</h2>
        <ol className="mt-6 grid gap-5 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 font-bold text-gold-800" aria-hidden="true">{index + 1}</span>
              <div>
                <h3 className="font-bold text-navy-700">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-navy-500">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 border-t border-navy-100 pt-5 text-sm leading-relaxed text-navy-600">
          Booking options depend on current verification, setup, and date availability for each listing. Saving a place, recording interest, sending an inquiry, or messaging a business does not create a reservation. Messaging is available for businesses with verified ownership where supported.
        </p>
      </div>
    </section>
  );
}
