import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, Shield, X } from "lucide-react";
import BarangayLogo from "../BarangayLogo.jsx";
import HazardTape from "../ui/HazardTape.jsx";
import { useLoginDialog } from "../../features/auth/LoginDialogContext.jsx";
import "./site.css";

/** Public navigation. "How it works" is an in-page section on the home page. */
const LINKS = [
  { to: "/", label: "Home", end: true },
  { to: { pathname: "/", hash: "#how" }, label: "How it works", hash: true },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

function NavLinks({ onNavigate }) {
  return LINKS.map((l) =>
    l.hash ? (
      // Plain Link: an in-page anchor is never the "current page".
      <Link key={l.label} to={l.to} className="site-nav-link" onClick={onNavigate}>{l.label}</Link>
    ) : (
      <NavLink key={l.label} to={l.to} end={l.end} className={({ isActive }) => `site-nav-link${isActive ? " is-active" : ""}`} onClick={onNavigate}>
        {l.label}
      </NavLink>
    )
  );
}

/**
 * Public site header (navy, full width) with the orange hazard tape above it.
 * Below 900px the links collapse behind a menu button (disclosure pattern:
 * aria-expanded; Esc or navigating closes it and focus returns to the button).
 */
export default function SiteHeader() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef(null);
  const location = useLocation();
  const { openLogin } = useLoginDialog();

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <HazardTape variant="orange" />
      <header className="site-header">
        <Link to="/" className="site-brand" aria-label="Binitayan DRRM — home">
          <BarangayLogo tone="light" size={52} />
          <span className="site-brand-text">
            <span className="site-wordmark">
              Binitayan <span className="site-wordmark-accent">DRRM</span>
              <Shield className="site-wordmark-shield" aria-hidden="true" size={15} strokeWidth={2.25} />
            </span>
            <span className="site-brand-sub">Barangay Binitayan · Daraga, Albay</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Main">
          <div className="site-nav-desktop">
            <NavLinks />
            <button type="button" className="btn btn-outline-on-navy site-login" aria-haspopup="dialog" onClick={() => openLogin()}>Log in</button>
          </div>
          <button
            ref={toggleRef}
            type="button"
            className="site-menu-toggle"
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </nav>
      </header>
      <div id="site-mobile-nav" className={`site-mobile-nav${open ? " is-open" : ""}`} hidden={!open}>
        <NavLinks onNavigate={() => setOpen(false)} />
        <button type="button" className="btn btn-outline-on-navy btn-lg" aria-haspopup="dialog" onClick={() => { setOpen(false); openLogin(); }}>Log in</button>
      </div>
    </>
  );
}
