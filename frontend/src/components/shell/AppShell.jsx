import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ShellStatusProvider } from "../../context/ShellStatusContext.jsx";
import useMediaQuery from "../../hooks/useMediaQuery.js";
import IdleLogout from "../IdleLogout.jsx";
import Sidebar from "../Sidebar.jsx";
import TopHeader from "./TopHeader.jsx";

const DESKTOP = "(min-width: 1024px)";

/**
 * Two-column authenticated shell: fixed 252px sidebar + fluid main column
 * (sticky header, page content up to 1280px). Below 1024px the sidebar is an
 * off-canvas drawer opened from the header; the rest of the page is inert
 * while it is open.
 */
export default function AppShell({ children }) {
  const isDesktop = useMediaQuery(DESKTOP);
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const location = useLocation();

  const closeNav = useCallback(() => setNavOpen(false), []);

  // Navigating, or growing past the breakpoint, closes the drawer.
  useEffect(() => setNavOpen(false), [location.pathname]);
  useEffect(() => {
    if (isDesktop) setNavOpen(false);
  }, [isDesktop]);

  // No background scrolling behind the open drawer.
  useEffect(() => {
    if (!navOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  const drawerOpen = !isDesktop && navOpen;

  return (
    <ShellStatusProvider>
      <div className="app-shell">
        <a href="#main" className="skip-link">Skip to main content</a>
        <Sidebar mode={isDesktop ? "static" : "drawer"} open={drawerOpen} onClose={closeNav} />
        {!isDesktop && (
          <div className={`drawer-backdrop${drawerOpen ? " is-open" : ""}`} onClick={closeNav} aria-hidden="true" />
        )}
        <div className="app-main" inert={drawerOpen ? "" : undefined}>
          <TopHeader
            ref={menuButtonRef}
            showMenuButton={!isDesktop}
            navOpen={drawerOpen}
            onOpenNav={() => setNavOpen(true)}
          />
          <main id="main" className="main-content" tabIndex={-1}>
            <div className="main-inner">{children}</div>
          </main>
        </div>
        <IdleLogout />
      </div>
    </ShellStatusProvider>
  );
}
