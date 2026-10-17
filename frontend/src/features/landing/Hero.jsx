import { ArrowRight, Phone } from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import IconTile from "../../components/ui/IconTile.jsx";
import { telHref } from "./api.js";
import MapPanel from "./MapPanel.jsx";

/** Emergency numbers under the hero buttons. */
function EmergencyLine({ hotline }) {
  return (
    <div className="emergency-line">
      <IconTile icon={Phone} tone="red" size="md" />
      <div>
        {hotline && (
          <p className="emergency-main">
            In an emergency, call <a href={telHref(hotline)}>{hotline}</a>
          </p>
        )}
        <p className="emergency-sub">
          National emergency hotline: <a href="tel:911">911</a>
        </p>
      </div>
    </div>
  );
}

/** Slate hero: message, calls to action and emergency line; live map on the right. */
export default function Hero({ data, alerts }) {
  return (
    <section className="lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-copy">
        <h1 id="hero-title" className="lp-h1">
          Prepared for disasters.
          <br />
          Focused on <span className="lp-highlight">recovery.</span>
        </h1>
        <p className="lp-lead">
          A web-based system that helps Barangay Binitayan manage disaster reports, assess affected households,
          track relief resources, and prioritize assistance through an explainable decision-support process.
        </p>
        <div className="lp-actions">
          <Button variant="primary-orange" size="lg" to="/register" iconEnd={ArrowRight}>Register as a resident</Button>
          <Button variant="outline-navy" size="lg" to={{ hash: "#how" }}>Explore the system</Button>
        </div>
        <EmergencyLine hotline={data.config.hotline} />
      </div>
      <MapPanel live={alerts} />
    </section>
  );
}
