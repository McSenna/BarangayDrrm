import { Tent } from "lucide-react";
import IconTile from "../../components/ui/IconTile.jsx";
import ProgressBar from "../../components/ui/ProgressBar.jsx";
import StatusPill from "../../components/ui/StatusPill.jsx";
import { evacuationTone } from "./api.js";

const TILE = { ok: "green", pending: "orange", critical: "red" };

/**
 * Evacuation space from public totals. Bar: > 50% free green, 20–50% orange,
 * < 20% red with a "Nearly full" label. Hidden when no center is open.
 */
export default function EvacuationCard({ evacuation, hotlineHref }) {
  if (!evacuation || evacuation.openCenters === 0) return null;
  const { tone, free, nearlyFull } = evacuationTone(evacuation);
  const { capacity, openCenters } = evacuation;
  const sub = free === 0 ? "All open centers are full right now" : nearlyFull ? "Space is limited — go early" : "Space is available right now";

  return (
    <article className="side-card evac-card" id="evacuation" aria-labelledby="evac-title" tabIndex={-1}>
      <div className="side-card-head">
        <IconTile icon={Tent} tone={TILE[tone]} size="md" />
        <div>
          <h3 id="evac-title" className="side-card-title">
            {openCenters === 1 ? "An evacuation center is open" : "Evacuation centers are open"}
          </h3>
          <p className="side-card-sub">{sub}</p>
        </div>
      </div>
      <p className="evac-figure">
        <span className="evac-number">{free}</span>
        <span className="evac-of">of {capacity} slots available</span>
        {nearlyFull && <StatusPill tone="critical">Nearly full</StatusPill>}
      </p>
      <ProgressBar value={free} max={capacity} tone={tone} label={`${free} of ${capacity} evacuation slots available${nearlyFull ? ", nearly full" : ""}`} />
      <p className="evac-meta">{openCenters} {openCenters === 1 ? "center" : "centers"} open</p>
      {hotlineHref && <a className="side-card-link" href={hotlineHref}>Call for the nearest center →</a>}
    </article>
  );
}
