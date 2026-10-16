import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import SiteHeader from "../components/site/SiteHeader.jsx";
import SiteFooter from "../components/site/SiteFooter.jsx";
import Hero from "../features/landing/Hero.jsx";
import LiveSituation from "../features/landing/LiveSituation.jsx";
import Capabilities from "../features/landing/Capabilities.jsx";
import HowItWorks from "../features/landing/HowItWorks.jsx";
import { useLandingData } from "../features/landing/api.js";
import "../features/landing/landing.css";

export default function Home() {
  const data = useLandingData();
  const { hash } = useLocation();

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
        <Hero data={data} />
        <LiveSituation data={data} />
        <Capabilities />
        <HowItWorks />
      </main>
      <SiteFooter />
    </div>
  );
}
