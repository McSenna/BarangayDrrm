import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Shield, X } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useSettings } from "../context/SettingsContext.jsx";
import { useShellStatus } from "../context/ShellStatusContext.jsx";
import useFocusTrap from "../hooks/useFocusTrap.js";
import BarangayLogo from "./BarangayLogo.jsx";
import HotlineCard from "./shell/HotlineCard.jsx";
import NavGroup from "./shell/NavGroup.jsx";
import NavItem from "./shell/NavItem.jsx";
import { NAV_BY_ROLE, itemContainsPath } from "./shell/navConfig.js";

const NO_SECTIONS = []; // stable fallback so the memo below doesn't recompute every render

export default function Sidebar({ mode = "static", open = false, onClose }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const status = useShellStatus();
  const location = useLocation();
  const panelRef = useRef(null);
  const isDrawer = mode === "drawer";

  const sections = NAV_BY_ROLE[user?.role] || NO_SECTIONS;

  const activeGroupKey = useMemo(() => {
    for (const section of sections) {
      const hit = section.items.find((item) => item.children && itemContainsPath(item, location.pathname));
      if (hit) return hit.key;
    }
    return null;
  }, [sections, location.pathname]);

  const [openGroups, setOpenGroups] = useState(() => new Set(activeGroupKey ? [activeGroupKey] : []));
  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroups((prev) => (prev.has(activeGroupKey) ? prev : new Set(prev).add(activeGroupKey)));
    }
  }, [activeGroupKey]);

  useFocusTrap(panelRef, isDrawer && open, onClose);

  if (!user) return null;

  const toggleGroup = (key) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const wordmark = String(settings.barangay_name || "Binitayan").replace(/^Barangay\s+/i, "");
  const dialogProps = isDrawer
    ? { role: "dialog", "aria-modal": open ? "true" : undefined, "aria-label": "Navigation menu", "aria-hidden": open ? undefined : "true" }
    : {};

  // <aside> as a page column; a plain <div> when it is a dialog (role="dialog" isn't allowed on <aside>).
  const Root = isDrawer ? "div" : "aside";

  return (
    <Root
      id="app-sidebar"
      ref={panelRef}
      className={`sidebar${isDrawer ? " sidebar-drawer" : ""}${isDrawer && open ? " is-open" : ""}`}
      tabIndex={-1}
      {...dialogProps}
    >
      <div className="sidebar-tape" aria-hidden="true" />

      <div className="sidebar-brand">
        {isDrawer && (
          <button type="button" className="sidebar-close" onClick={onClose} aria-label="Close navigation menu">
            <X aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        )}
        <BarangayLogo size={64} />
        <p className="wordmark">
          <Shield className="wordmark-shield" aria-hidden="true" size={16} strokeWidth={2.25} />
          <span>{wordmark}</span>
          <span className="wordmark-accent">DRRM</span>
        </p>
        <p className="brand-subtitle">Barangay Disaster Risk Reduction &amp; Management</p>
      </div>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <div className="nav-section" key={section.label}>
            <p className="nav-section-label">{section.label}</p>
            <ul className="nav-list" role="list">
              {section.items.map((item) => {
                const badge = item.badge ? item.badge(status) : null;
                return (
                  <li key={item.key || item.to}>
                    {item.children ? (
                      <NavGroup
                        label={item.label}
                        icon={item.icon}
                        badge={badge}
                        open={openGroups.has(item.key)}
                        current={item.key === activeGroupKey}
                        onToggle={() => toggleGroup(item.key)}
                      >
                        {item.children}
                      </NavGroup>
                    ) : (
                      <NavItem
                        to={item.to}
                        label={item.label}
                        icon={item.icon}
                        end={item.end}
                        badge={badge}
                        highlight={(item.also || []).length > 0 && itemContainsPath(item, location.pathname)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <HotlineCard />
    </Root>
  );
}
