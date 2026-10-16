import { DRRM_PHASES } from "../../utils/drrmPhase.js";

/**
 * DRRM phase tracker: a segmented pill, current phase highlighted (navy,
 * or red for Response). Scrolls sideways on narrow screens.
 */
export default function PhaseTracker({ current }) {
  return (
    // Focusable so the tracker can be scrolled by keyboard when it overflows.
    <div className="phase-scroll" tabIndex={0} role="region" aria-label="DRRM phase tracker">
      <ol className="phase-tracker" aria-label="DRRM phase">
        {DRRM_PHASES.map((phase) => {
          const isCurrent = phase === current;
          const cls = !isCurrent ? "phase" : phase === "Response" ? "phase is-current is-response" : "phase is-current";
          return (
            <li key={phase} className={cls} aria-current={isCurrent ? "step" : undefined}>
              {phase}
              {isCurrent && <span className="sr-only"> (current phase)</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
