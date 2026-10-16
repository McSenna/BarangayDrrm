import HazardTape from "../../components/ui/HazardTape.jsx";
import Skeleton from "../../components/ui/Skeleton.jsx";
import AlertCard from "./AlertCard.jsx";
import EvacuationCard from "./EvacuationCard.jsx";
import WeatherCard from "./WeatherCard.jsx";
import { relativeTime, telHref } from "./api.js";

/** Skeleton with the same footprint as the loaded band, so nothing shifts. */
function LiveSkeleton() {
  return (
    <div className="live-grid" aria-hidden="true">
      <div className="alert-card alert-skeleton">
        <div className="alert-head"><Skeleton width={52} height={52} radius={14} /><div className="alert-head-text"><Skeleton width={140} height={12} /><Skeleton width="60%" height={26} /></div></div>
        <div className="alert-body"><Skeleton height={86} radius={14} /><Skeleton height={86} radius={14} /><Skeleton width="70%" height={16} /></div>
      </div>
      <div className="live-side">
        <div className="side-card"><Skeleton width="70%" height={20} /><Skeleton width={90} height={40} /><Skeleton height={8} /></div>
        <div className="side-card weather-card"><Skeleton width="60%" height={20} onDark /><Skeleton height={56} onDark /></div>
      </div>
    </div>
  );
}

/**
 * Navy band: the barangay's live hazard level for residents (public records
 * only). Loading shows a skeleton; a failed refresh keeps the last data and,
 * once it is over 15 minutes old, says it is reconnecting. Never blank.
 */
export default function LiveSituation({ data }) {
  const { hazard, evacuation, weather, config, loading, failed, lastUpdated, stale, now } = data;
  const hotlineHref = config.hotline ? telHref(config.hotline) : null;

  return (
    <section className="live" aria-labelledby="live-title">
      <HazardTape variant="red" />
      <div className="live-inner">
        <header className="live-head">
          <p className="lp-eyebrow live-eyebrow"><span className="live-dot" aria-hidden="true" />Live situation</p>
          <h2 id="live-title" className="lp-h2 live-title">What's happening in Binitayan</h2>
          {lastUpdated && !stale && (
            <p className="live-updated">
              Updated <time dateTime={lastUpdated.toISOString()}>{relativeTime(lastUpdated, now)}</time> from verified barangay records.
            </p>
          )}
          {(stale || (failed && !lastUpdated)) && (
            <p className="live-stale" role="status">
              {lastUpdated
                ? <>Last updated <time dateTime={lastUpdated.toISOString()}>{lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</time> — reconnecting…</>
                : "Can't reach barangay records right now — reconnecting…"}
            </p>
          )}
        </header>

        {loading || !hazard ? (
          <LiveSkeleton />
        ) : (
          <div className="live-grid">
            <AlertCard hazard={hazard} hasOpenCenters={Boolean(evacuation?.openCenters)} hotlineHref={hotlineHref} />
            <div className="live-side">
              <EvacuationCard evacuation={evacuation} hotlineHref={hotlineHref} />
              <WeatherCard weather={weather} now={now} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
