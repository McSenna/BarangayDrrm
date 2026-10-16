// Full class names so Tailwind keeps them in the build.
const STEPS = [
  { tone: "step-red", title: "Report", body: "Barangay personnel record an incident report from the affected purok." },
  { tone: "step-orange", title: "Verify & assess", body: "Barangay officials verify the report and assess household damage." },
  { tone: "step-navy", title: "Prioritize", body: "The decision support system ranks households and explains why." },
  { tone: "step-green", title: "Allocate & notify", body: "The Administrator approves relief, and residents are notified by SMS." },
];

export function StepCard({ number, tone, title, body }) {
  return (
    <li className={`step-card ${tone}`}>
      <span className="step-num" aria-hidden="true">{number}</span>
      <h3 className="step-title"><span className="sr-only">Step {number}: </span>{title}</h3>
      <p className="step-body">{body}</p>
    </li>
  );
}

/** "From report to relief" — the four-step workflow (anchor #how). */
export default function HowItWorks() {
  return (
    <section className="lp-section lp-section-white" id="how" aria-labelledby="how-title" tabIndex={-1}>
      <p className="lp-eyebrow lp-eyebrow-orange">How it works</p>
      <h2 id="how-title" className="lp-h2">From report to relief, in four steps.</h2>
      <ol className="step-grid">
        {STEPS.map((s, i) => <StepCard key={s.title} number={i + 1} {...s} />)}
      </ol>
    </section>
  );
}
