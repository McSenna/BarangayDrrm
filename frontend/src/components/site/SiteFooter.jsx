import { Link } from "react-router-dom";
import { useSettings } from "../../context/SettingsContext.jsx";
import { mapPublicConfig, telHref } from "../../features/landing/api.js";
import "./site.css";

/** Public site footer (navy-deep): about, explore links, emergency numbers. */
export default function SiteFooter() {
  const { settings } = useSettings();
  const { hotline, hallAddress } = mapPublicConfig(settings);
  return (
    <footer className="site-foot">
      <div className="site-foot-grid">
        <div>
          <p className="site-foot-brand">Binitayan<span className="site-wordmark-accent">DRRM</span></p>
          <p className="site-foot-text">Post-Disaster Monitoring and Relief Allocation System of Barangay Binitayan, Daraga, Albay.</p>
        </div>
        <nav aria-labelledby="foot-explore">
          <h2 id="foot-explore" className="site-foot-label">Explore</h2>
          <ul className="site-foot-list" role="list">
            <li><Link to="/">Home</Link></li>
            <li><Link to={{ pathname: "/", hash: "#how" }}>How it works</Link></li>
            <li><Link to="/about">About</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </nav>
        <section aria-labelledby="foot-emergency">
          <h2 id="foot-emergency" className="site-foot-label">Emergency</h2>
          <ul className="site-foot-list" role="list">
            {hotline && <li>BDRRM: <a href={telHref(hotline)}>{hotline}</a></li>}
            <li>National: <a href="tel:911">911</a></li>
            {hallAddress && <li>{hallAddress}</li>}
          </ul>
        </section>
      </div>
      <p className="site-foot-legal">
        © {new Date().getFullYear()} Barangay Binitayan, Daraga, Albay — Post-Disaster Monitoring and Relief Allocation System
      </p>
    </footer>
  );
}
