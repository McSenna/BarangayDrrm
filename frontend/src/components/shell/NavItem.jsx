import { NavLink } from "react-router-dom";
import NavBadge from "./NavBadge.jsx";

/**
 * One sidebar link. NavLink sets aria-current="page" on the active item,
 * which is drawn as a white pill with bold navy text.
 * `nested` items sit inside a NavGroup: shorter, no icon.
 * `highlight` keeps the pill on pages reached from inside this link
 * (e.g. Send SMS under SMS Notifications).
 */
export default function NavItem({ to, label, icon: Icon, end, badge, nested = false, highlight = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item${nested ? " nav-item-nested" : ""}${isActive || highlight ? " active" : ""}`}
    >
      {Icon && <Icon className="nav-icon" aria-hidden="true" size={18} strokeWidth={1.75} />}
      <span className="nav-label">{label}</span>
      <NavBadge badge={badge} />
    </NavLink>
  );
}
