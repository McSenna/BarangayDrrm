import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import SiteHeader from "../components/site/SiteHeader.jsx";
import SiteFooter from "../components/site/SiteFooter.jsx";
import Hero from "../features/landing/Hero.jsx";
import LiveSituation from "../features/landing/LiveSituation.jsx";
import Capabilities from "../features/landing/Capabilities.jsx";
import HowItWorks from "../features/landing/HowItWorks.jsx";
import { useLandingData } from "../features/landing/api.js";
import useActiveAlerts from "../features/alerts/useActiveAlerts.js";
import "../features/landing/landing.css";

export default function Home() {
  const data = useLandingData();
  const alerts = useActiveAlerts();
  const { hash } = useLocation();

  // The alert panel refreshes every ~15 s; when it sees a change, refresh the Live Situation card too,
  // so the two never disagree for the card's full 60 s cycle.
  const signature = alerts.status === "ready" ? alerts.alerts.map((a) => `${a.id}:${a.severity}:${a.updatedAt}`).join("|") : null;
  const lastSignature = useRef(null);
  const { refresh: refreshLanding } = data;
  useEffect(() => {
    if (signature === null) return;
    if (lastSignature.current !== null && lastSignature.current !== signature) refreshLanding();
    lastSignature.current = signature;
  }, [signature, refreshLanding]);

  useEffect(() => {
    document.title = "Barangay Binitayan DRRM — Disaster Monitoring & Relief";
  }, []);

  // In-page links (#how, #hazard-map, #evacuation): scroll there and move focus for keyboard users.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    el.focus?.({ preventScroll: true });
  }, [hash, data.loading]);

  return (
    <div className="lp">
      <SiteHeader />
      <main id="main" className="lp-main" tabIndex={-1}>
        <Hero data={data} alerts={alerts} />
        <LiveSituation data={data} />
        <Capabilities />
        <HowItWorks />
      </main>
      <SiteFooter />
    </div>
  );
}
